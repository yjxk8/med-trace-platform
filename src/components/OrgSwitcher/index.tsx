/**
 * 顶栏「机构 + 部门」常驻显示(2026-11-17:机构选择改搜索+单列行)
 * - 机构:type1 可点击弹选择对话框(搜索框 + 单列紧凑行,50+ 机构不失控;
 *   预取→三键落盘→整页刷新,语义不变);type2/普通员工纯展示——无箭头、无对话框
 * - 部门:展示当前工作部门(个人绑定 vo.depts,isDefault 优先,已删不计入);
 *   有绑定者可点击弹对话框切换;管理员无个人绑定 → 纯展示 '-'
 * - ★机构名解析链:① perm.orgName ② orgs 匹配 orgId ③ vo.org.miName(LoginVO 契约位)
 *   ④ 全空时调 GET /api/mi/detail/{orgId} 取 MiVO.name;localStorage 缓存 24h;
 *   软删 500/受限 403 静默,不 toast 轰炸
 * - 单行布局红线:<a> 自身 flex + 箭头 flexShrink:0,长名称省略收敛,两段永不换行
 */

import {
  ApartmentOutlined,
  BankOutlined,
  CheckOutlined,
  DownOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useModel } from '@umijs/max';
import { App, Divider, Empty, Modal, Select, Tag, Tooltip } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { OrgItemVO } from '@/services/auth';
import { fetchOrgContext } from '@/services/auth';
import { getMiDetail, type MiVO } from '@/services/org/mi';
import { setOrgId, useOrgId } from '@/utils/orgContext';
import { saveDynRoutes } from '@/utils/permission';

/** 当前工作部门持久键(仅前端工作上下文,不影响数据权限) */
const CUR_DEPT_KEY = 'curDeptId';
/** 机构名翻译缓存 TTL(机构改名低频,24h 兜底防陈旧) */
const NAME_TTL = 24 * 3600 * 1000;

export default function OrgSwitcher() {
  const { message } = App.useApp();
  const { initialState } = useModel('@@initialState');
  const state = initialState as any;
  const perm = state?.perm;
  const vo = state?.login;
  const orgId = useOrgId();

  const orgs: OrgItemVO[] = vo?.orgs ?? [];
  const isType1 = perm?.isAdmin === true && perm?.adminType === 1;
  /** type1 且带机构列表才给切换箭头(type1 但 orgs 空退化为纯展示) */
  const canSwitchOrg = isType1 && orgs.length > 0;

  // ── 机构选择对话框(仅 type1) ──
  const [orgOpen, setOrgOpen] = useState(false);
  const [switching, setSwitching] = useState<number | null>(null);

  // ── 部门选择对话框 + 当前工作部门(持久化 + 跨账号残留自愈) ──
  const [deptOpen, setDeptOpen] = useState(false);
  const [curDeptId, setCurDeptId] = useState<number | null>(() => {
    const v = Number(localStorage.getItem(CUR_DEPT_KEY) ?? 0);
    return v > 0 ? v : null;
  });

  /** ④详情翻译结果(静态链①②③解析不到时由 effect 填充) */
  const [fetchedName, setFetchedName] = useState<string | null>(null);

  /** 个人部门绑定(管理员 depts 为机构树非个人绑定 → 空;已删不计入) */
  const myDepts = useMemo(() => {
    if (perm?.isAdmin) return [];
    return ((vo?.depts ?? []) as any[]).filter(
      (d) => Number(d.deptDelFlag) !== 2,
    );
  }, [perm, vo]);

  /** 当前工作部门:持久 id 在绑定内 → 用之;否则 isDefault 优先,缺省首个 */
  const curDept = useMemo(() => {
    if (!myDepts.length) return null;
    const hit = curDeptId
      ? myDepts.find((d) => Number(d.deptId) === curDeptId)
      : null;
    return hit ?? myDepts.find((d) => Number(d.isDefault) === 1) ?? myDepts[0];
  }, [myDepts, curDeptId]);

  /** 残留自愈:持久 id 不在当前账号绑定内(换账号/绑定变更)→ 清空回退默认 */
  useEffect(() => {
    if (
      curDeptId != null &&
      myDepts.length > 0 &&
      !myDepts.some((d) => Number(d.deptId) === curDeptId)
    ) {
      setCurDeptId(null);
    }
  }, [myDepts, curDeptId]);

  /** 静态解析链①②③(解析不到 → null,交由④详情翻译) */
  const staticOrgName = useMemo(() => {
    if (perm?.orgName) return String(perm.orgName);
    const hit = orgs.find((o) => Number(o.org.miId) === Number(orgId));
    if (hit?.org?.miName) return hit.org.miName;
    if (vo?.org?.miName) return String(vo.org.miName);
    return null;
  }, [perm, orgs, orgId, vo]);

  /** ④详情翻译:静态链全空 + orgId 有效 → 查缓存(24h)→ 未命中调 getMiDetail */
  useEffect(() => {
    setFetchedName(null);
    if (staticOrgName || orgId == null) return;
    const key = `miName:${orgId}`;
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        const { name, ts } = JSON.parse(cached);
        if (name && Date.now() - Number(ts) < NAME_TTL) {
          setFetchedName(String(name));
          return;
        }
      }
    } catch {
      /* 缓存损坏 → 走请求 */
    }
    let alive = true;
    getMiDetail(orgId)
      .then((r: MiVO) => {
        const name = r?.name; // MiVO 出参字段是 name;status=2 关闭仍返回可显示
        if (alive && name) {
          localStorage.setItem(key, JSON.stringify({ name, ts: Date.now() }));
          setFetchedName(String(name));
        }
      })
      .catch(() => {
        // 静默:软删 500 / 权限 403 → 维持占位;后端 LoginVO 补 org 是长期正解
      });
    return () => {
      alive = false;
    };
  }, [orgId, staticOrgName]);

  /** 最终机构名:静态链 → 翻译结果 → 占位 */
  const orgName =
    staticOrgName ?? fetchedName ?? (orgId ? `机构 ${orgId}` : '未选择机构');

  /** type1 切换机构:预取 → 三键落盘 → 整页刷新停留当前路径 */
  const handleSwitch = async (item: OrgItemVO) => {
    if (!isType1 || switching) return;
    if (item.empty) {
      message.warning(`机构「${item.org.miName}」暂无配置`);
      return;
    }
    if (Number(item.org.miId) === Number(orgId)) return;
    const next = item.org.miId;
    setSwitching(next);
    try {
      const ctx: any = await fetchOrgContext(next);
      if (ctx?.empty) {
        message.warning(`机构「${item.org.miName}」暂无配置`);
        setSwitching(null);
        return;
      }
      setOrgId(next);
      localStorage.setItem('lastOrgId', String(next));
      saveDynRoutes(ctx?.menus ?? []);
      message.success(`已切换至:${item.org.miName}`);
      setTimeout(
        () =>
          window.location.replace(
            window.location.pathname + window.location.search,
          ),
        300,
      );
    } catch (e) {
      message.error((e as Error).message);
      setSwitching(null);
    }
  };

  /** 选当前工作部门(仅前端上下文,持久化) */
  const pickDept = (d: any) => {
    setCurDeptId(Number(d.deptId));
    localStorage.setItem(CUR_DEPT_KEY, String(d.deptId));
    message.success(`当前部门:${d.deptName ?? `#${d.deptId}`}`);
    setDeptOpen(false);
  };

  // ── 展示节点(单行:图标/文字/箭头 flex 收敛) ──
  const orgInner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        maxWidth: 220,
      }}
    >
      <BankOutlined style={{ color: '#1677ff', flexShrink: 0 }} />
      <Tooltip title={orgName}>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 14,
          }}
        >
          {orgName}
        </span>
      </Tooltip>
    </div>
  );

  const deptTooltip =
    myDepts.length > 1
      ? `所属部门:${myDepts.map((d) => d.deptName).join('、')}`
      : undefined;

  const deptInner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        maxWidth: 200,
      }}
    >
      <ApartmentOutlined style={{ color: '#8c8c8c', flexShrink: 0 }} />
      <Tooltip title={deptTooltip}>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 14,
            color: curDept ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.45)',
          }}
        >
          {curDept?.deptName ?? '-'}
        </span>
      </Tooltip>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        whiteSpace: 'nowrap',
        flexShrink: 0, // 禁被顶栏挤压,杜绝意外换行
      }}
    >
      {/* ── 机构段:type1 可点开对话框;type2/普通员工纯展示(无箭头无点击) ── */}
      {canSwitchOrg ? (
        <a
          onClick={(e) => {
            e.preventDefault();
            setOrgOpen(true);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'inherit',
            cursor: 'pointer',
            minWidth: 0,
          }}
        >
          {orgInner}
          <DownOutlined
            style={{
              fontSize: 10,
              color: '#8c8c8c',
              marginLeft: 4,
              flexShrink: 0,
            }}
          />
        </a>
      ) : (
        orgInner
      )}

      {/* 机构选择对话框(仅 type1):组合框形态——输入即筛、下拉即选;
          antd Select 下拉自带 256px 内部滚动 + rc-virtual-list 虚拟滚动,50~1000 个机构不卡 */}
      {canSwitchOrg && (
        <Modal
          title={`选择机构(共 ${orgs.length} 个)`}
          open={orgOpen}
          footer={null}
          width={520}
          centered
          onCancel={() => setOrgOpen(false)}
          destroyOnHidden
        >
          <Select<number>
            style={{ width: '100%' }}
            size="large"
            showSearch
            suffixIcon={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="搜索机构名称 / 机构代码"
            value={orgId ?? undefined} // 默认选中当前机构(未选择机构时显示 placeholder)
            loading={switching != null} // 切换中输入框转圈;成功即整页刷新
            filterOption={(input, option) =>
              String((option as any)?.search ?? '')
                .toLowerCase()
                .includes(input.trim().toLowerCase())
            }
            options={orgs.map((o) => ({
              value: o.org.miId,
              label: o.org.miName,
              search: `${o.org.miName ?? ''} ${o.org.miCode ?? ''}`, // 名称+代码双匹配
              disabled: !!o.empty || Number(o.org.miId) === Number(orgId),
            }))}
            // 下拉行自定义:图标 / 名称(省略) / 代码 / 暂无配置 / 当前勾选
            optionRender={(option) => {
              const o = orgs.find((x) => x.org.miId === option.value);
              if (!o) return option.label;
              const cur = Number(o.org.miId) === Number(orgId);
              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <BankOutlined style={{ color: '#1677ff', flexShrink: 0 }} />
                  <Tooltip title={o.org.miName}>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: cur ? 600 : 400,
                      }}
                    >
                      {o.org.miName}
                    </span>
                  </Tooltip>
                  {o.empty && (
                    <Tag style={{ marginInlineEnd: 0, flexShrink: 0 }}>
                      暂无配置
                    </Tag>
                  )}
                  <span style={{ color: '#999', fontSize: 12, flexShrink: 0 }}>
                    代码:{o.org.miCode}
                  </span>
                  {cur && (
                    <CheckOutlined
                      style={{ color: '#1677ff', flexShrink: 0 }}
                    />
                  )}
                </div>
              );
            }}
            onSelect={(v) => {
              const o = orgs.find((x) => x.org.miId === v);
              if (o) handleSwitch(o); // 预取→三键落盘→整页刷新,语义不变
            }}
            notFoundContent={
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="未找到匹配机构"
              />
            }
          />
          <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
            输入名称或代码即可筛选;「暂无配置」的机构不可选
          </div>
        </Modal>
      )}

      <Divider
        type="vertical"
        style={{ height: 16, background: 'rgba(0,0,0,0.12)', flexShrink: 0 }}
      />

      {/* ── 部门段:有个人绑定者可点开对话框;无绑定纯展示 '-' ── */}
      {myDepts.length > 0 ? (
        <a
          onClick={(e) => {
            e.preventDefault();
            setDeptOpen(true); // ★部门段只开部门对话框(此前误挂机构打开逻辑)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'inherit',
            cursor: 'pointer',
            minWidth: 0,
          }}
        >
          {deptInner}
          <DownOutlined
            style={{
              fontSize: 10,
              color: '#8c8c8c',
              marginLeft: 4,
              flexShrink: 0,
            }}
          />
        </a>
      ) : (
        deptInner
      )}

      {/* 部门选择对话框(有个人绑定者) */}
      {myDepts.length > 0 && (
        <Modal
          title="选择部门"
          open={deptOpen}
          footer={null}
          width={480}
          centered
          onCancel={() => setDeptOpen(false)}
          destroyOnHidden
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myDepts.map((d: any) => {
              const cur = Number(curDept?.deptId) === Number(d.deptId);
              return (
                <div
                  key={d.deptId}
                  onClick={() => pickDept(d)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${cur ? '#1677ff' : '#f0f0f0'}`,
                    background: cur ? '#f0f7ff' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <ApartmentOutlined
                    style={{ color: '#1677ff', flexShrink: 0 }}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: cur ? 600 : 400,
                    }}
                  >
                    {d.deptName ?? `#${d.deptId}`}
                  </span>
                  {Number(d.isDefault) === 1 && (
                    <Tag
                      color="geekblue"
                      style={{ marginInlineEnd: 0, flexShrink: 0 }}
                    >
                      默认
                    </Tag>
                  )}
                  {Number(d.deptStatus) === 2 && (
                    <Tag
                      color="orange"
                      style={{ marginInlineEnd: 0, flexShrink: 0 }}
                    >
                      停用
                    </Tag>
                  )}
                  {cur && (
                    <CheckOutlined
                      style={{ color: '#1677ff', flexShrink: 0 }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ color: '#999', fontSize: 12, marginTop: 12 }}>
            所选部门仅作为当前工作上下文展示,不影响数据权限(权限由角色与部门绑定决定)
          </div>
        </Modal>
      )}
    </div>
  );
}
