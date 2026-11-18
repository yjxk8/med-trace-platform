/**
 * 角色管理（分页表 + 多条件筛选 + 已选条件 Tag + 状态启停）—— 契约：角色管理 v1.0
 * 当前态（M1~M3 全量闭环）：
 *  ① 「状态」列 + 筛选 + 已选条件 Tag（OPT-01 闭环）；
 *  ② 操作列口径调整：操作 ≤4 个平铺，超过 4 个才收进「更多」Dropdown——
 *    当前 4 个操作（编辑/分配菜单/停用|启用/删除）全部平铺，取消 Dropdown；
 *    二期新增 OPT-12「查看权限」（第 5 个）时，需将第 4 个起收进 Dropdown；
 *  ③ 启停：文案互斥，停用二次确认（影响在线用户），启用轻操作直接执行；
 *    图标互斥：停用↓灰 / 启用↑绿；
 *  ④ 删除确认文案含绑定校验承诺（OPT-02 闭环：4001 文案后端返回透传）；
 *  ⑤ 4101/4102 表单内联提示在 RoleFormModal（OPT-05 闭环）。
 * 状态口径：status=停用可恢复（列表照常展示，仅 Tag 区分）；delFlag=删除不可见，无需处理。
 * 【待产品确认】停用行操作策略：当前按方案 A 不限制（管理员可预配置菜单后再启用）。
 * 二期预留：OPT-07 属地筛选 / OPT-09 合规标识 / OPT-12 只读「查看权限」抽屉
 */
import {
  ApartmentOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  InfoCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
  App,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
} from 'antd';
import { useMemo, useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import {
  changeRoleStatus,
  deleteRole,
  getRolePage,
  ROLE_STATUS,
  type RoleQuery,
  type RoleStatus,
  type RoleVO,
} from '@/services/org/role';
import AssignMenuModal from './AssignMenuModal';
import RoleFormModal from './RoleFormModal';
import {
  DATA_SCOPE_OPTIONS,
  ROLE_SCOPE_OPTIONS,
  ROLE_STATUS_OPTIONS,
  ROLE_TYPE_OPTIONS,
  renderDataScope,
  renderRoleScope,
  renderRoleStatus,
  renderRoleType,
} from './shared';
import './index.less';

/** 已选条件支持的筛选键 */
type FilterKey =
  | 'name'
  | 'code'
  | 'roleType'
  | 'dataScope'
  | 'roleScope'
  | 'status';

interface ActiveFilter {
  key: FilterKey;
  label: string;
}

/** Select 选项反查 label（S() 归一化，对齐 shared 红线） */
function findLabel(
  opts: { value: number; label: string }[],
  v: number | undefined,
): string {
  if (v == null) return '';
  return opts.find((o) => String(o.value) === String(v))?.label ?? String(v);
}

export default function RoleManage() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);

  // ===== 筛选态（state 控 UI，filterRef 供 request 读取）=====
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [roleType, setRoleType] = useState<number | undefined>(undefined);
  const [dataScope, setDataScope] = useState<number | undefined>(undefined);
  const [roleScope, setRoleScope] = useState<number | undefined>(undefined);
  const [roleStatus, setRoleStatus] = useState<number | undefined>(undefined);
  const filterRef = useRef<RoleQuery>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RoleVO | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignRole, setAssignRole] = useState<RoleVO | null>(null);

  /** 已选条件 Tag 数据源（随筛选态派生，单个可移除） */
  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const arr: ActiveFilter[] = [];
    const n = name.trim();
    const c = code.trim();
    if (n) arr.push({ key: 'name', label: `名称：${n}` });
    if (c) arr.push({ key: 'code', label: `编码：${c}` });
    if (roleType != null)
      arr.push({
        key: 'roleType',
        label: `角色类型：${findLabel(ROLE_TYPE_OPTIONS, roleType)}`,
      });
    if (dataScope != null)
      arr.push({
        key: 'dataScope',
        label: `数据范围：${findLabel(DATA_SCOPE_OPTIONS, dataScope)}`,
      });
    if (roleScope != null)
      arr.push({
        key: 'roleScope',
        label: `角色范围：${findLabel(ROLE_SCOPE_OPTIONS, roleScope)}`,
      });
    if (roleStatus != null)
      arr.push({
        key: 'status',
        label: `状态：${findLabel(ROLE_STATUS_OPTIONS, roleStatus)}`,
      });
    return arr;
  }, [name, code, roleType, dataScope, roleScope, roleStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = () => {
    filterRef.current = {
      name: name.trim() || undefined,
      code: code.trim() || undefined,
      roleType,
      dataScope,
      roleScope,
      status: roleStatus,
    };
    actionRef.current?.reloadAndRest?.(); // 筛选后页码重置为 1
  };

  const doReset = () => {
    setName('');
    setCode('');
    setRoleType(undefined);
    setDataScope(undefined);
    setRoleScope(undefined);
    setRoleStatus(undefined);
    filterRef.current = {};
    actionRef.current?.reloadAndRest?.(); // 重置后页码重置为 1
  };

  /** 已选条件 Tag 单个移除（同步 filterRef 并重置页码） */
  const removeFilter = (key: FilterKey) => {
    if (key === 'name') setName('');
    else if (key === 'code') setCode('');
    else if (key === 'roleType') setRoleType(undefined);
    else if (key === 'dataScope') setDataScope(undefined);
    else if (key === 'roleScope') setRoleScope(undefined);
    else if (key === 'status') setRoleStatus(undefined);
    const next = { ...filterRef.current };
    delete next[key];
    filterRef.current = next;
    actionRef.current?.reloadAndRest?.(); // 移除条件后页码重置为 1
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  /**
   * 启停（OPT-01 闭环）：文案互斥「停用/启用」；
   * 停用影响在线用户 → 二次确认；启用轻操作 → 直接执行；成功 message 透传后端返回值。
   * 失败统一 toast 后端 message；rejection 仅在确认框路径抛出（antd 捕获保持开启），
   * 直调路径吞掉，防控制台 unhandled rejection。
   */
  const toggleStatus = (r: RoleVO) => {
    const disabled =
      String(r.status ?? ROLE_STATUS.NORMAL) === String(ROLE_STATUS.DISABLED);
    const target: RoleStatus = disabled
      ? ROLE_STATUS.NORMAL
      : ROLE_STATUS.DISABLED;
    const doToggle = async () => {
      try {
        const res = await changeRoleStatus(r.id, target);
        message.success(
          res?.message ?? (target === ROLE_STATUS.NORMAL ? '已启用' : '已停用'),
        );
        actionRef.current?.reload();
      } catch (e) {
        message.error((e as Error).message); // '状态值非法…' / '角色不存在，id=x' 透传
        throw e; // 确认框路径保持开启；直调路径由 .catch 吞掉
      }
    };
    if (disabled) {
      // 启用直接执行——错误已 toast，吞 rejection 防控制台 unhandled 告警
      doToggle().catch(() => undefined);
    } else {
      Modal.confirm({
        title: `确认停用角色「${r.name}」？`,
        content:
          '停用后该角色下用户将立即失去对应菜单的访问权限（可随时重新启用）。',
        okText: '停用',
        okButtonProps: { danger: true },
        onOk: doToggle,
      });
    }
  };

  /**
   * 删除：danger 操作，确认框 onOk 自带 loading。
   * OPT-02 闭环：已绑定角色删除被拒，4001 文案（含绑定数 N）由后端返回透传。
   */
  const removeRole = (r: RoleVO) => {
    Modal.confirm({
      title: `删除角色「${r.name}」？`,
      content:
        '删除后角色不可恢复，已绑定用户的访问将同步失效（若角色已分配用户，删除将被拒绝并提示解绑）。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await deleteRole(r.id);
          message.success(res?.message || '删除成功');
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message);
          throw e; // 保持确认框开启（对齐工程约定）
        }
      },
    });
  };

  const columns: ProColumns<RoleVO>[] = [
    { title: '角色名称', dataIndex: 'name', width: 180, ellipsis: true },
    { title: '角色编码', dataIndex: 'code', width: 200, ellipsis: true },
    {
      title: '角色类型',
      dataIndex: 'roleType',
      width: 100,
      align: 'center',
      render: (_, r) => renderRoleType(r.roleType),
    },
    {
      title: '数据范围',
      dataIndex: 'dataScope',
      width: 130,
      align: 'center',
      // 二期合规扩展位（OPT-09 预留）
      render: (_, r) => renderDataScope(r.dataScope),
    },
    {
      title: '角色范围',
      dataIndex: 'roleScope',
      width: 90,
      align: 'center',
      render: (_, r) => renderRoleScope(r.roleScope),
    },
    {
      // OPT-01：状态列（正常=绿 / 停用=灰；停用角色照常出现在列表，仅 Tag 区分）
      title: '状态',
      dataIndex: 'status',
      width: 80,
      align: 'center',
      render: (_, r) => renderRoleStatus(r.status),
    },
    {
      title: (
        <span className="role-sort-title">
          排序
          {/* sort 列头提示「越小越靠前」 */}
          <Tooltip title="值越小越靠前">
            <InfoCircleOutlined style={{ color: '#bfbfbf', marginLeft: 2 }} />
          </Tooltip>
        </span>
      ),
      dataIndex: 'sort',
      width: 70,
      align: 'center',
      render: (_, r) => r.sort ?? '-',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 160,
      ellipsis: true,
      render: (_, r) => r.remark || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 160,
      render: (_, r) => r.createTime || '-',
    },
    {
      title: '操作',
      valueType: 'option',
      fixed: 'right',
      width: 170,
      align: 'center',
      // 调整：操作列口径——≤4 个平铺，>4 个才收进「更多」Dropdown；
      // 当前 4 个操作全部平铺；二期新增 OPT-12「查看权限」（第 5 个）时需收 Dropdown
      // ⚠️ 第一参是 dom，必须占位 _（历史坑）
      render: (_, r) => {
        const disabled =
          String(r.status ?? ROLE_STATUS.NORMAL) ===
          String(ROLE_STATUS.DISABLED);
        return (
          <Space size={0}>
            {/* 1/4 编辑 */}
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={
                  <EditOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
                }
                onClick={() => {
                  setEditing(r);
                  setFormOpen(true);
                }}
              />
            </Tooltip>
            {/* 2/4 分配菜单 */}
            <Tooltip title="分配菜单">
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={
                  <ApartmentOutlined
                    style={{ color: '#8c8c8c', fontSize: 14 }}
                  />
                }
                onClick={() => {
                  setAssignRole(r);
                  setAssignOpen(true);
                }}
              />
            </Tooltip>
            {/* 3/4 停用|启用（图标互斥：停用↓灰 / 启用↑绿） */}
            <Tooltip title={disabled ? '启用' : '停用'}>
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={
                  disabled ? (
                    <ArrowUpOutlined
                      style={{ color: '#52c41a', fontSize: 14 }}
                    />
                  ) : (
                    <ArrowDownOutlined
                      style={{ color: '#8c8c8c', fontSize: 14 }}
                    />
                  )
                }
                onClick={() => toggleStatus(r)}
              />
            </Tooltip>
            {/* 4/4 删除（danger） */}
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                style={{ padding: '0 4px' }}
                icon={<DeleteOutlined style={{ fontSize: 14 }} />}
                onClick={() => removeRole(r)}
              />
            </Tooltip>
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
          minHeight: 0, // flex 链路生效前提（分页钉底布局）
          background: '#fff',
          borderRadius: 8,
          padding: '12px 16px 8px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 筛选区：查询主按钮 / 重置次按钮 */}
        <div
          style={{ display: 'flex', gap: 8, marginBottom: 8, flexShrink: 0 }}
        >
          <Input
            allowClear
            style={{ width: 180 }}
            placeholder="角色名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={doSearch}
          />
          <Input
            allowClear
            style={{ width: 180 }}
            placeholder="角色编码"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onPressEnter={doSearch}
          />
          <Select
            allowClear
            style={{ width: 110 }}
            placeholder="角色类型"
            options={ROLE_TYPE_OPTIONS}
            value={roleType}
            onChange={(v) => setRoleType(v)}
          />
          <Select
            allowClear
            style={{ width: 150 }}
            placeholder="数据范围"
            options={DATA_SCOPE_OPTIONS}
            value={dataScope}
            onChange={(v) => setDataScope(v)}
          />
          <Select
            allowClear
            style={{ width: 110 }}
            placeholder="角色范围"
            options={ROLE_SCOPE_OPTIONS}
            value={roleScope}
            onChange={(v) => setRoleScope(v)}
          />
          {/* OPT-01：状态筛选 */}
          <Select
            allowClear
            style={{ width: 90 }}
            placeholder="状态"
            options={ROLE_STATUS_OPTIONS}
            value={roleStatus}
            onChange={(v) => setRoleStatus(v)}
          />
          <Button type="primary" onClick={doSearch}>
            查询
          </Button>
          <Button onClick={doReset}>重置</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ marginLeft: 'auto' }}
            onClick={openCreate}
          >
            新增角色
          </Button>
        </div>

        {/* 已选条件 Tag（单个移除，移除后页码重置；出现/消失由 flex 自动重分配高度） */}
        {activeFilters.length > 0 && (
          <div className="role-filter-tags">
            <span className="role-filter-tags__label">已选条件：</span>
            {activeFilters.map((f) => (
              <Tag
                key={f.key}
                closable
                className="role-filter-tags__item"
                onClose={() => removeFilter(f.key)}
              >
                {f.label}
              </Tag>
            ))}
          </div>
        )}

        {/* 表格填充区：flex:1 撑满剩余高度；表格内部滚动 + 表头 sticky + 分页钉底 */}
        <div className="role-table-fill">
          <FillTable
            pro
            headerTitle="角色列表"
            rowKey={(r: RoleVO) => r.id}
            actionRef={actionRef}
            columns={columns}
            search={false}
            options={{ reload: true, density: false, setting: false }}
            cardBordered={false}
            // 只传横向滚动；纵向高度由 .role-table-fill 的 flex 布局管理
            scroll={{ x: 1280 }}
            // 固定每页 10 行（FillTable 自适应分页会按视口高度算 pageSize）
            pagination={{
              pageSize: 10,
              defaultPageSize: 10,
              showSizeChanger: false,
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无角色"
                >
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={openCreate}
                  >
                    新增角色
                  </Button>
                </Empty>
              ),
            }}
            request={async (params: {
              current?: number;
              pageSize?: number;
            }) => {
              try {
                // IPage → ProTable 结构适配在页面回调完成（§2.3，service 层保持原始类型）
                const page = await getRolePage({
                  ...filterRef.current,
                  page: params.current,
                  size: params.pageSize,
                });
                return {
                  data: page.records ?? [],
                  total: page.total ?? 0,
                  success: true,
                };
              } catch (e) {
                message.error((e as Error).message);
                return { data: [], total: 0, success: false };
              }
            }}
          />
        </div>
      </div>

      <RoleFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          actionRef.current?.reload();
        }}
      />

      <AssignMenuModal
        open={assignOpen}
        role={assignRole}
        onClose={() => setAssignOpen(false)}
        onSaved={() => setAssignOpen(false)}
      />
    </PageFill>
  );
}
