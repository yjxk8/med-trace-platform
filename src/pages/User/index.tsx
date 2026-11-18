/**
 * 用户管理(列表页)—— 范式对齐「药品库存 / 字典管理 / 角色管理」:
 * PageFill 骨架 + 白卡 + FillTable(ProTable request 模式) + App.useApp message
 * 契约:v3 终版(新 key:account/name/sex/phone/post/position/level/status/miId)
 *
 * 当前态(2026-11-17 v2):
 * ① 筛选区仅 关键字/状态(类型/租户类型搜索项移除——产品定版;query 少传参数零风险,
 *    §3.2 query 全可选,后端零改动);已选条件 Tag 行同步收敛为 关键字/状态;
 *    ★关键字仍支持拼音码检索(后端 keyword 匹配 姓名/账号/手机号/拼音码,列虽不展示但可搜)
 * ② 列定版(2026-11-17):「所属机构」列移除(列表恒锁定登录机构,列值冗余;
 *    数据过滤零变化,miId 恒注入);「拼音码」列移除(产品定版:拼音码仅编辑弹窗展示);
 *    「处方类别」列新增(page 响应已含 prescClass,零后端改动)
 * ③ .user-table-fill flex 链路(index.less):表格内部滚动 + 表头 sticky + 分页钉底;
 *    列宽全部百分比(tableLayout=fixed),100% 撑满容器不出横向滚动条;
 * ④ 分页固定每页 10 行、关闭页大小切换(对齐角色页);
 * ⑤ 空状态引导「新增用户」;
 * ⑥ 确认框失败保持开启:removeUser / toggleStatus 的 onOk 内 try/catch + throw(对齐角色页);
 * ⑦ 操作列:编辑/锁定|解锁/重置密码平铺,分配角色/分配部门/复制权限/删除收 Dropdown;
 * ⑧ 编辑弹窗 pyCode 回显+回传见 UserFormModal(2026-11-17 新契约,编辑页保留拼音码);
 * ⑨ ★重置密码一键直达(2026-11-17):不弹对话框,点图标直接调 resetUserPassword(id)
 *    (不传 newPwd → 后端重置为固定密码 123456,loginStatus=3 下次登录引导改密);
 *    成功仅 toast 固定值口径,绝不写「新密码已发送」;ResetPwdModal 已移除。
 *
 * 红线(交接文档沿用):
 * - 防自锁:后端无守卫(§八-3)→ 自己的行隐藏「锁定/解锁」「删除」,账号旁标「当前用户」
 * - 锁定 ≠ 踢下线 / 软删 ≠ 立即掉线:确认文案不写「立即下线/掉线」
 * - 删除用户同步解除全部角色绑定(契约 §4.1,确认文案已告知)
 * - 机构数据域不变:列表恒锁定登录所选机构(恒注入 miId);机构下拉筛选暂无需求
 * - ★机构数据域响应式:useOrgId 事件驱动;切机构清筛选+重置页码重查(保险通道;
 *   常规切机构走 OrgSwitcher 整页刷新,组件重挂);无机构上下文不发请求,宁缺勿漏
 *
 * ⚠️ FillTable 非泛型:回调参数显式注解(TS7006)
 */
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  ClusterOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  MoreOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import type { MenuProps } from 'antd';
import {
  App,
  Button,
  Dropdown,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import {
  deleteUser,
  getUserDetail,
  pageUser,
  resetUserPassword, // ★⑨:一键重置直达(service 契约不变,不传 newPwd → 123456)
  setUserStatus,
  USER_STATUS,
  type UserVO,
} from '@/services/org/user';
import { useOrgId } from '@/utils/orgContext';
import CopyPermissionModal from './CopyPermissionModal';
import {
  fmtFull,
  renderSex,
  renderStatus,
  USER_PRESC_CLASS_OPTIONS,
  USER_STATUS_OPTIONS,
} from './shared';
import UserDeptAssignModal from './UserDeptAssignModal';
import UserFormModal from './UserFormModal';
import UserRoleAssignModal from './UserRoleAssignModal';
import './index.less';

/** 已选条件支持的筛选键(2026-11-17:类型/租户类型搜索项移除,仅剩 关键字/状态) */
type FilterKey = 'keyword' | 'status';

interface ActiveFilter {
  key: FilterKey;
  label: string;
}

/** Select 选项反查 label(S() 归一化,对齐 shared 红线);列表处方类别列复用 */
function findLabel(
  opts: { value: string | number; label: string }[],
  v: string | number | undefined | null,
): string {
  if (v == null) return '';
  return opts.find((o) => String(o.value) === String(v))?.label ?? String(v);
}

export default function UserManage() {
  const { message } = App.useApp();
  /** 当前登录用户(防自锁):登录页 setInitialState({ token, currentUser }) 写入,
   * 与登录态同源;v3 起字段为 id/account(原 uId/uAccount 作废) */
  const { initialState } = useModel('@@initialState');
  const self = initialState?.currentUser;

  const [copySource, setCopySource] = useState<UserVO | null>(null);

  // ===== 机构数据域(2026-11-12 口径 · 响应式版):列表锁定登录所选机构,非本机构用户不展示 =====
  /** 当前机构 miId(与 X-Org-Id / 表单 miId 同源):useOrgId 事件驱动,
   * 切机构即时重渲染(软切换保险通道;常规路径为 OrgSwitcher 整页刷新) */
  const orgId = useOrgId();
  const miId = orgId != null && Number(orgId) > 0 ? Number(orgId) : null;
  /** ProTable request 可能捕获首帧闭包 → ref 恒读最新(防陈旧闭包,对齐 filterRef 范式) */
  const miIdRef = useRef<number | null>(miId);
  miIdRef.current = miId;
  // (机构名 useMemo 已随「所属机构」列移除;数据域 miId 恒注入不变)

  const actionRef = useRef<ActionType | undefined>(undefined);

  // ===== 筛选(受控态 + 快照 ref,查询时生效——对齐 filterRef 范式;仅 关键字/状态)=====
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  const filterRef = useRef<{ keyword?: string; status?: string }>({});

  // ===== 机构切换响应(保险通道):清筛选 + 重置页码重查;旧机构筛选不带入新机构 =====
  const prevMiRef = useRef<number | null>(miId);
  useEffect(() => {
    if (prevMiRef.current === miId) return;
    prevMiRef.current = miId;
    if (miId == null) return; // 无机构:请求防御层已返回空,不必再触发查询
    setKeyword('');
    setStatus(undefined);
    filterRef.current = {};
    actionRef.current?.reloadAndRest?.();
  }, [miId]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserVO | null>(null);
  // (★⑨ resetTarget 状态已删:重置密码一键直达,不再经弹窗)
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUser, setAssignUser] = useState<UserVO | null>(null);
  const [deptOpen, setDeptOpen] = useState(false);
  const [deptUser, setDeptUser] = useState<UserVO | null>(null);

  /** 防自锁:id 或账号命中当前登录用户;self 取不到时守卫自动失效(不阻塞) */
  const isSelf = (r: UserVO) =>
    (self?.id != null && Number(r.id) === Number(self.id)) ||
    (!!self?.account && r.account === self.account);

  /** 已选条件 Tag 数据源(随筛选态派生,单个可移除;对齐角色页) */
  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const arr: ActiveFilter[] = [];
    const k = keyword.trim();
    if (k) arr.push({ key: 'keyword', label: `关键字:${k}` });
    if (status != null)
      arr.push({
        key: 'status',
        label: `状态:${findLabel(USER_STATUS_OPTIONS, status)}`,
      });
    return arr;
  }, [keyword, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = () => {
    filterRef.current = {
      keyword: keyword.trim() || undefined,
      status,
    };
    actionRef.current?.reloadAndRest?.();
  };

  const doReset = () => {
    setKeyword('');
    setStatus(undefined);
    filterRef.current = {};
    actionRef.current?.reloadAndRest?.();
  };

  /** 已选条件 Tag 单个移除(同步 filterRef 并重置页码;对齐角色页) */
  const removeFilter = (key: FilterKey) => {
    if (key === 'keyword') setKeyword('');
    else if (key === 'status') setStatus(undefined);
    const next = { ...filterRef.current };
    delete next[key];
    filterRef.current = next;
    actionRef.current?.reloadAndRest?.();
  };

  /** 编辑:行数据先上屏,详情覆盖回显(防旧行缺字段 → 空表单/undefined);
   * pyCode 回显依赖 detail 响应(2026-11-17 后端已补),见 UserFormModal */
  const openEdit = (r: UserVO) => {
    setEditing(r);
    setFormOpen(true);
    getUserDetail(r.id)
      .then(setEditing)
      .catch(() => {});
  };

  // ===== 行操作(失败 toast 后端原文 + throw 保持确认框开启,对齐角色页)=====
  const removeUser = (r: UserVO) => {
    Modal.confirm({
      title: `删除账号「${r.name}」?`,
      content:
        '删除后该账号将无法登录,账号名将被占用不可复用(含已删除账号);同时将同步解除其全部角色绑定,确定删除?',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await deleteUser(r.id);
          message.success(res?.message || '删除成功');
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message);
          throw e; // 保持确认框开启(对齐角色页约定)
        }
      },
    });
  };

  const toggleStatus = (r: UserVO) => {
    const lock = String(r.status) === USER_STATUS.NORMAL;
    Modal.confirm({
      title: lock ? `锁定账号「${r.name}」?` : `解锁账号「${r.name}」?`,
      content: lock ? '锁定后该账号将无法登录。' : '解锁后该账号可正常登录。',
      okText: lock ? '锁定' : '解锁',
      okButtonProps: lock ? { danger: true } : undefined,
      onOk: async () => {
        try {
          const res = await setUserStatus(r.id, lock ? 2 : 1);
          message.success(res?.message || (lock ? '已锁定' : '已解锁'));
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message);
          throw e; // 保持确认框开启(对齐角色页约定)
        }
      },
    });
  };

  /** ★⑨ 重置密码(2026-11-17:确认对话框 + 一键重置):
   * 点图标先弹确认(说明后果)→ 确认后调 resetUserPassword(id)
   * (不传 newPwd → 后端重置为固定密码 123456,loginStatus=3 下次登录引导改密);
   * 成功仅 toast 固定值口径,绝不写「新密码已发送」;
   * 失败 toast 后端原文 + throw 保持确认框开启(对齐 removeUser/toggleStatus 约定) */
  const resetPwd = (r: UserVO) => {
    Modal.confirm({
      title: `重置密码「${r.name}」?`,
      content:
        '重置后该账号密码将变为默认密码 123456,该用户下次登录将被引导修改密码,确定重置?',
      okText: '重置',
      onOk: async () => {
        try {
          const res = await resetUserPassword(r.id);
          message.success(res?.message || '重置完成,默认密码为 123456');
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message);
          throw e; // 保持确认框开启(对齐角色页约定)
        }
      },
    });
  };

  // ===== 列定义(数组显式泛型;列宽百分比合计 100%)=====
  const columns: ProColumns<UserVO>[] = [
    {
      title: '工号',
      dataIndex: 'account',
      width: '9%',
      align: 'center',
      render: (_, r) => (
        <Space size={4}>
          <span>{r.account || '-'}</span>
          {isSelf(r) && <Tag color="blue">当前用户</Tag>}
        </Space>
      ),
    },
    {
      title: '姓名',
      dataIndex: 'name',
      width: '8%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => r.name || '-',
    },
    {
      title: '性别',
      dataIndex: 'sex',
      width: '6%',
      align: 'center',
      render: (_, r) => renderSex(r.sex),
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      width: '11%',
      align: 'center',
      render: (_, r) => r.phone || '-',
    },
    {
      title: '岗位',
      dataIndex: 'post',
      width: '9%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => r.post || '-', // 字典 code,【遗留#2】接入后换渲染
    },
    {
      title: '职务',
      dataIndex: 'position',
      width: '9%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => r.position || '-',
    },
    {
      title: '职称/级别',
      dataIndex: 'level',
      width: '9%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => r.level || '-', // 字典 code,【遗留#2】
    },
    // ★处方类别列(2026-11-17 新增):1麻醉 2一类精神 3二类精神 4普通;空值 '-'
    {
      title: '处方类别',
      dataIndex: 'prescClass',
      width: '8%',
      align: 'center',
      ellipsis: true,
      render: (_, r) =>
        findLabel(USER_PRESC_CLASS_OPTIONS, r.prescClass) || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: '7%',
      align: 'center',
      render: (_, r) => renderStatus(r.status),
    },
    // (2026-11-17:「所属机构」列移除——列表恒锁定登录机构,列值冗余;「拼音码」列移除
    //  ——产品定版:拼音码仅编辑弹窗展示;关键字检索仍支持拼音码,后端 keyword 匹配不变)
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: '14%',
      align: 'center',
      render: (_, r) => fmtFull(r.createTime),
    },
    {
      title: '操作',
      valueType: 'option',
      width: '10%',
      align: 'center',
      // 口径对齐角色管理页:≤4 个平铺,超过 4 个第 4 个起收进「更多」Dropdown——
      // 编辑/锁定|解锁/重置密码平铺,分配角色/分配部门/复制权限/删除收 Dropdown
      // ⚠️ 第一参是 dom 节点,必须占位 _(历史坑)
      render: (_, r) => {
        const items: MenuProps['items'] = [
          {
            key: 'assign',
            icon: <ApartmentOutlined />,
            label: '分配角色',
            onClick: () => {
              setAssignUser(r);
              setAssignOpen(true);
            },
          },
          {
            key: 'dept',
            icon: <ClusterOutlined />,
            label: '分配部门',
            onClick: () => {
              setDeptUser(r);
              setDeptOpen(true);
            },
          },
        ];
        items.push({
          key: 'copy',
          icon: <CopyOutlined />,
          label: '复制权限',
          onClick: () => setCopySource(r),
        });
        if (!isSelf(r)) {
          items.push({
            key: 'delete',
            icon: <DeleteOutlined />,
            danger: true,
            label: '删除',
            onClick: () => removeUser(r),
          });
        }
        return (
          <Space size={0}>
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={
                  <EditOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
                }
                onClick={() => openEdit(r)}
              />
            </Tooltip>
            {!isSelf(r) && (
              <Tooltip
                title={
                  String(r.status) === USER_STATUS.NORMAL ? '锁定' : '解锁'
                }
              >
                <Button
                  type="text"
                  size="small"
                  style={{ padding: '0 4px' }}
                  icon={
                    String(r.status) === USER_STATUS.NORMAL ? (
                      <StopOutlined
                        style={{ color: '#8c8c8c', fontSize: 14 }}
                      />
                    ) : (
                      <CheckCircleOutlined
                        style={{ color: '#52c41a', fontSize: 14 }}
                      />
                    )
                  }
                  onClick={() => toggleStatus(r)}
                />
              </Tooltip>
            )}
            <Tooltip title="重置密码(重置为 123456)">
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={
                  <KeyOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
                }
                onClick={() => resetPwd(r)} // ★⑨一键直达:不弹对话框
              />
            </Tooltip>
            <Dropdown menu={{ items }}>
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={
                  <MoreOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
                }
              />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  return (
    <PageFill>
      <div
        style={{
          flex: 1,
          minHeight: 0, // flex 链路生效前提(分页钉底布局)
          background: '#fff',
          borderRadius: 8,
          padding: '12px 16px 8px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 筛选区:keyword / 状态(2026-11-17:类型/租户类型搜索项移除,产品定版);
            ★keyword 仍支持拼音码检索(后端匹配 姓名/账号/手机号/拼音码);
            机构为固定数据域(恒注入 miId,不进筛选/已选条件) */}
        <div
          style={{ display: 'flex', gap: 8, marginBottom: 8, flexShrink: 0 }}
        >
          <Input
            allowClear
            style={{ width: 240 }}
            placeholder="姓名 / 账号 / 手机号 / 拼音码"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={doSearch}
          />
          <Select
            allowClear
            style={{ width: 110 }}
            placeholder="状态"
            options={USER_STATUS_OPTIONS}
            value={status}
            onChange={(v) => setStatus(v)}
          />
          <Button type="primary" onClick={doSearch}>
            查询
          </Button>
          <Button onClick={doReset}>重置</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ marginLeft: 'auto' }}
            disabled={miId == null} // ★无机构上下文禁止新增(双保险之一,弹窗内还有守卫)
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            新增用户
          </Button>
        </div>

        {/* 已选条件 Tag(单个移除,移除后页码重置;出现/消失由 flex 自动重分配高度) */}
        {activeFilters.length > 0 && (
          <div className="user-filter-tags">
            <span className="user-filter-tags__label">已选条件:</span>
            {activeFilters.map((f) => (
              <Tag
                key={f.key}
                closable
                className="user-filter-tags__item"
                onClose={() => removeFilter(f.key)}
              >
                {f.label}
              </Tag>
            ))}
          </div>
        )}

        {/* 表格填充区:flex:1 撑满剩余高度;表格内部滚动 + 表头 sticky + 分页钉底(对齐角色页) */}
        <div className="user-table-fill">
          <FillTable
            pro
            headerTitle="用户列表"
            rowKey={(r: UserVO) => String(r.id)}
            actionRef={actionRef}
            columns={columns}
            search={false}
            options={{ reload: true, density: false, setting: false }}
            cardBordered={false}
            tableLayout="fixed" // ★固定布局:百分比列宽严格遵守 + ellipsis 生效
            pagination={{
              pageSize: 10,
              defaultPageSize: 10,
              showSizeChanger: false,
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无用户"
                >
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={miId == null}
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    新增用户
                  </Button>
                </Empty>
              ),
            }}
            request={async (params: {
              current?: number;
              pageSize?: number;
            }) => {
              const cur = miIdRef.current; // ★恒读最新机构(防陈旧闭包)
              if (cur == null) {
                // 无机构上下文防御(常规到不了):不发请求,宁可不展示也不漏全平台数据
                return { data: [], total: 0, success: false };
              }
              try {
                const res = await pageUser({
                  page: params.current ?? 1,
                  size: params.pageSize ?? 10,
                  miId: cur, // ★锁定登录所选机构(固定数据域,不进 filterRef/已选条件)
                  ...filterRef.current, // 仅 keyword/status(2026-11-17:类型/租户类型已移除)
                });
                return { data: res.records, total: res.total, success: true };
              } catch (e) {
                message.error((e as Error).message);
                return { data: [], total: 0, success: false };
              }
            }}
          />
        </div>
      </div>

      <CopyPermissionModal
        open={!!copySource}
        source={copySource}
        onClose={() => setCopySource(null)}
        onDone={() => {
          setCopySource(null);
          actionRef.current?.reload(); // 用户列表无绑定数列,刷新为幂等保险(§5.4 按需刷新)
        }}
      />
      <UserFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          actionRef.current?.reload();
        }}
      />
      {/* (★⑨ ResetPwdModal 已移除:重置密码一键直达,见 resetPwd) */}
      <UserRoleAssignModal
        open={assignOpen}
        user={assignUser}
        onClose={() => setAssignOpen(false)}
        onSaved={() => setAssignOpen(false)}
      />
      <UserDeptAssignModal
        open={deptOpen}
        user={deptUser}
        onClose={() => setDeptOpen(false)}
        onSaved={() => setDeptOpen(false)}
      />
    </PageFill>
  );
}
