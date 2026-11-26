/**
 * 用户权限复制弹窗(A→B/C)—— 契约:关键点.md · 用户权限复制 v1.0(后端已落地 2026-11-09)
 * 交互(§5.2):源用户卡 → 权限预览(角色/部门两列) → 目标选择(远程搜索多选) → 复制范围双开关 → 错误警示条
 * 语义红线(§1/§3):
 * - 全量替换:仅替换勾选维度,未勾维度目标保持不变;不可撤销(警示条原文,二次确认引用)
 * - 用户组绝不复制(麻精合规通道);关键角色服务端源头预排除 → 结果报告(§7.1 前端无法预标)
 * - 空集不清空(§3.2 服务端保证);跨机构:角色全量/部门按目标机构过滤+warning(§3.3)
 * - 不踢会话:目标下个请求即生效;幂等可重跑(§7.4 无需防重提示)
 * 提交校验(§5.3):目标非空 + 双开关至少一项 → 否则禁用;提交前 confirm 二次确认(引用警示条原文)
 */

import { useModel } from '@umijs/max';
import {
  Alert,
  App,
  Checkbox,
  Descriptions,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import { useDict } from '@/hooks/useDict';
import { getRolePage } from '@/services/org/role'; // ★对齐点①:角色分页函数,导出名按 role.ts 实际调整
import {
  type CopyPermissionResult,
  copyPermission,
  fetchUserDepts,
  fetchUserOptions,
  fetchUserRoles,
  getUserDetail,
  USER_TYPE,
  type UserDeptItem,
  type UserRoleItem,
  type UserVO,
} from '@/services/org/user';
import { getMiId } from '@/services/tenant';
import CopyPermissionResultModal from './CopyPermissionResultModal';
import { USER_DICT } from './dictCodes';

/** 角色 status:1 启用 2 停用(§6;停用仍复制仅打标)——若 role.ts 已有枚举可替换 */
const ROLE_STATUS_STOP = '2';

interface Props {
  open: boolean;
  source: UserVO | null; // 源用户(列表行数据,详情覆盖回显)
  onClose: () => void;
  /** 结果弹窗关闭后回调(§5.4 父级按需刷新) */
  onDone: () => void;
}

export default function CopyPermissionModal({
  open,
  source,
  onClose,
  onDone,
}: Props) {
  const { message } = App.useApp();
  const { initialState } = useModel('@@initialState');

  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<UserVO | null>(null);
  const [roles, setRoles] = useState<UserRoleItem[]>([]);
  const [depts, setDepts] = useState<UserDeptItem[]>([]);
  const [roleMap, setRoleMap] = useState<
    Map<number, { name: string; status: string }>
  >(new Map());
  const { batchTranslate } = useDict();
  const [postLabels, setPostLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    batchTranslate(USER_DICT.post)
      .then(setPostLabels)
      .catch(() => {});
  }, []);
  // 目标选择(远程搜索多选):optMap 只增不减(防已选项因换词丢标签),searchHits=最新命中
  const [targets, setTargets] = useState<number[]>([]);
  const [optMap, setOptMap] = useState<
    Map<number, { value: number; label: string }>
  >(new Map());
  const [searchHits, setSearchHits] = useState<number[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const [copyRoles, setCopyRoles] = useState(true);
  const [copyDepts, setCopyDepts] = useState(true);
  const [result, setResult] = useState<CopyPermissionResult | null>(null);

  /** 源用户机构名(detail.miId → login.orgs 匹配 → perm 兜底,与列表页同源) */
  const sourceOrgName = useMemo(() => {
    const id = detail?.miId;
    if (id == null) return '-';
    const hit = (initialState as any)?.login?.orgs?.find?.(
      (o: any) => Number(o?.org?.miId) === Number(id),
    );
    return (
      hit?.org?.miName ?? (initialState as any)?.perm?.orgName ?? `机构 ${id}`
    );
  }, [detail, initialState]);

  /** §4 目标候选:options(miId+keyword+type=3),排除源本人;
   *  ★对齐点②(口径):传当前机构 miId(与列表机构锁定一致);如需开放跨机构复制,
   *  去掉 miId 参数即可——后端按目标机构过滤部门并出 warning(§3.3),前端零改动 */
  const runSearch = (kw: string) => {
    setSearching(true);
    fetchUserOptions({
      miId: getMiId() ?? undefined,
      type: USER_TYPE.ORG_USER, // §4:type=3 仅普通用户
      keyword: kw.trim() || undefined,
    })
      .then((list) => {
        const hits = (list ?? []).filter(
          (o) => Number(o.id) !== Number(source?.id),
        );
        setOptMap((prev) => {
          const next = new Map(prev);
          hits.forEach((o) => {
            next.set(Number(o.id), {
              value: Number(o.id),
              label: `${o.name}（${o.account}）`,
            });
          });
          return next;
        });
        setSearchHits(hits.map((o) => Number(o.id)));
      })
      .catch(() => {})
      .finally(() => setSearching(false));
  };

  const onTargetSearch = (kw: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(kw), 300);
  };

  /** §4:源角色清单无名称/状态 → 角色列表接口建 roleId→{name,status} 映射;
   *  ⚠️ 必须用带 status 的分页接口——fetchRoleOptions 仅出正常角色,停用角色会被误判已删(§3.8) */
  const buildRoleMap = async (): Promise<
    Map<number, { name: string; status: string }>
  > => {
    const res = await getRolePage({ page: 1, size: 500 }); // 角色量级小,一次拉全
    return new Map(
      (res.records ?? []).map((r: any) => [
        Number(r.id),
        { name: String(r.name ?? ''), status: String(r.status) },
      ]),
    );
  };

  useEffect(() => {
    if (!open || !source?.id) return;
    setTargets([]);
    setOptMap(new Map());
    setSearchHits([]);
    setCopyRoles(true);
    setCopyDepts(true);
    setRoles([]);
    setDepts([]);
    setRoleMap(new Map());
    setResult(null);
    setDetail(source); // 行数据先上屏,详情覆盖回显(对齐 openEdit 范式)
    setLoading(true);
    runSearch(''); // 目标候选首屏
    Promise.all([
      getUserDetail(source.id)
        .then(setDetail)
        .catch(() => {}),
      fetchUserRoles(source.id)
        .then(setRoles)
        .catch(() => []),
      fetchUserDepts(source.id)
        .then(setDepts)
        .catch(() => []),
      buildRoleMap()
        .then(setRoleMap)
        .catch(() => new Map()),
    ]).finally(() => setLoading(false));
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [open, source?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 已选 ∪ 最新命中(防已选项标签丢失) */
  const targetOptions = useMemo(() => {
    const ids = new Set<number>([...searchHits, ...targets]);
    return Array.from(ids)
      .map((id) => optMap.get(id))
      .filter((o): o is { value: number; label: string } => !!o);
  }, [searchHits, targets, optMap]);

  /** §5.3:提交前二次确认(引用警示条原文);失败 toast 后端原文 + throw 保持确认框开启 */
  const handleOk = () => {
    if (!source?.id) return;
    const scope = [copyRoles && '角色', copyDepts && '部门']
      .filter(Boolean)
      .join(' + ');
    Modal.confirm({
      title: `确认复制权限给 ${targets.length} 名目标用户？`,
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>
            复制范围:{scope}(全量替换,仅替换勾选的维度)
          </div>
          <div>
            目标用户现有的角色与部门绑定将被整体替换,此操作不可撤销;目标用户无需重新登录,下次请求即生效。
          </div>
        </div>
      ),
      okText: '确认复制',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await copyPermission({
            sourceUserId: source.id,
            targetUserIds: targets,
            copyRoles,
            copyDepts,
          });
          onClose(); // 关主弹窗
          setResult(res); // code===200 即开结果(部分成功也是成功,§5.4)
        } catch (e) {
          message.error((e as Error).message); // §2 失败表:message 直渲染
          throw e;
        }
      },
    });
  };

  return (
    <>
      <DraggableModal
        title={`复制权限：${detail?.name ?? ''} → 目标用户`}
        open={open}
        onOk={handleOk}
        onCancel={onClose}
        okText="确认复制"
        cancelText="取消"
        okButtonProps={{
          disabled: targets.length === 0 || (!copyRoles && !copyDepts),
        }} // §5.3
        destroyOnHidden
        width={880}
        centered
        styles={{
          body: {
            maxHeight: 'calc(100vh - 210px)',
            overflowY: 'auto',
            paddingTop: 4,
          },
        }}
      >
        {/* 1. 源用户卡(§5.2.1) */}
        <Descriptions
          column={4}
          size="small"
          bordered
          style={{ marginBottom: 12 }}
        >
          <Descriptions.Item label="姓名">
            {detail?.name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="账号">
            {detail?.account || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="岗位">
            {detail?.post
              ? (postLabels[String(detail.post)] ?? detail.post)
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="机构">{sourceOrgName}</Descriptions.Item>
        </Descriptions>

        {/* 2. 权限预览(§5.2.2):角色左 / 部门右 */}
        <Spin spinning={loading}>
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                复制角色（{roles.length}）
              </div>
              <Space size={[4, 4]} wrap style={{ minHeight: 24 }}>
                {!loading && roles.length === 0 && (
                  <span style={{ color: '#bfbfbf' }}>无直授角色</span>
                )}
                {roles.map((r) => {
                  const info = roleMap.get(Number(r.roleId));
                  if (!info) {
                    // §7.2:软删角色不在角色列表 → #id 灰显是正确表现
                    return <Tag key={r.roleId}>#{r.roleId}（已删除）</Tag>;
                  }
                  return (
                    <span
                      key={r.roleId}
                      style={{
                        display: 'inline-flex',
                        gap: 2,
                        alignItems: 'center',
                      }}
                    >
                      <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                        {info.name}
                      </Tag>
                      {String(info.status) === ROLE_STATUS_STOP && (
                        <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                          停用
                        </Tag> // §3.8 仍复制
                      )}
                      {Number(r.isDefault) === 1 && (
                        <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>
                          默认
                        </Tag> // §3.5 仅打标
                      )}
                    </span>
                  );
                })}
              </Space>
              <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
                麻精关键角色将自动排除，并在结果中单独报告（须走用户组授权通道）
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                复制部门（{depts.length}）
              </div>
              <Space size={[4, 4]} wrap style={{ minHeight: 24 }}>
                {!loading && depts.length === 0 && (
                  <span style={{ color: '#bfbfbf' }}>无部门绑定</span>
                )}
                {depts.map((d) => {
                  const deleted = Number(d.deptDelFlag) === 2; // §3.8:仅已删除排除
                  const stopped = Number(d.deptStatus) === 2;
                  return (
                    <span
                      key={d.deptId}
                      style={{
                        display: 'inline-flex',
                        gap: 2,
                        alignItems: 'center',
                      }}
                    >
                      <Tag
                        color={deleted ? 'default' : 'blue'}
                        style={{ marginInlineEnd: 0 }}
                      >
                        {d.deptName ?? `#${d.deptId}`}
                      </Tag>
                      {deleted && (
                        <Tag style={{ marginInlineEnd: 0 }}>
                          已删除（不复制）
                        </Tag>
                      )}
                      {!deleted && stopped && (
                        <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                          停用
                        </Tag>
                      )}
                      {Number(d.isDefault) === 1 && (
                        <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>
                          默认部门
                        </Tag>
                      )}
                    </span>
                  );
                })}
              </Space>
              <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
                已删除部门不复制；停用部门正常复制；跨机构目标按其机构匹配部门，无匹配则保留原部门并提示
              </div>
            </div>
          </div>
        </Spin>

        {/* 3. 目标选择(§5.2.3):远程搜索多选,排除源本人,≤200 */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            目标用户
            <span
              style={{
                fontWeight: 400,
                color: '#8c8c8c',
                fontSize: 12,
                marginLeft: 8,
              }}
            >
              已选 {targets.length}/200（远程搜索，仅普通用户，已排除源本人）
            </span>
          </div>
          <Select
            mode="multiple"
            showSearch
            filterOption={false}
            maxCount={200} // §2:≤200,达上限禁止再加(antd≥5.13;旧版本改 onChange slice 兜底)
            style={{ width: '100%' }}
            placeholder="输入姓名 / 账号 / 拼音码搜索目标用户"
            value={targets}
            options={targetOptions}
            onSearch={onTargetSearch}
            onChange={(v) => setTargets(v as number[])}
            notFoundContent={searching ? '搜索中...' : '无匹配用户'}
          />
        </div>

        {/* 4. 复制范围(§5.2.4):至少一项才可提交(按钮侧已联动禁用) */}
        <div style={{ marginTop: 12 }}>
          <Checkbox
            checked={copyRoles}
            onChange={(e) => setCopyRoles(e.target.checked)}
          >
            复制角色
          </Checkbox>
          <Checkbox
            checked={copyDepts}
            onChange={(e) => setCopyDepts(e.target.checked)}
          >
            复制部门
          </Checkbox>
          {!copyRoles && !copyDepts && (
            <span style={{ color: '#faad14', marginLeft: 8 }}>
              至少勾选一项
            </span>
          )}
        </div>

        {/* 5. 警示条(§5.2.5,原文,不可关闭) */}
        <Alert
          type="error"
          showIcon
          closable={false}
          style={{ marginTop: 12 }}
          message="目标用户现有的角色与部门绑定将被整体替换（仅替换勾选的维度），此操作不可撤销。目标用户无需重新登录，下次请求即生效。"
        />
      </DraggableModal>

      {/* 结果弹窗(§5.4)——★必须在主弹窗 sibling 位置渲染:主弹窗 destroyOnHidden 不影响其存活 */}
      <CopyPermissionResultModal
        open={!!result}
        result={result}
        onClose={() => {
          setResult(null);
          onDone();
        }}
      />
    </>
  );
}
