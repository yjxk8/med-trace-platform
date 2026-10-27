/**
 * 角色管理（分页表 + 多条件筛选 + 已选条件 Tag）—— 契约：角色管理 v1.0 §2.2/§2.3/§7
 * 修复：分页布局——显式传 pagination 会绕过 FillTable 自适应填充，导致卡片高度
 *      塌缩为内容高度（滚动条 + 分页浮动）。改为 flex 自管：
 *      筛选区/Tag 固定 → 表格区 flex:1 撑满剩余高度（.role-table-fill）→
 *      表格内部滚动 + 表头 sticky → 分页钉死底部（与行数无关）。
 *      已选条件 Tag 出现/消失时高度自动重分配，不再依赖 reservedHeight 手调。
 * 【待后端：BE-ROLE-OPT-01】启用/停用接口落地后，操作列追加第 4 个操作并收进「更多」Dropdown
 * 【待后端：BE-ROLE-OPT-02】t_user_role 绑定校验上线后，删除失败文案由后端透传（前端已兼容）
 * 【待后端：BE-ROLE-OPT-06】统一响应体 wrapper + Authorization 格式落地后，仅需 bizRequest 侧适配
 */
import {
  ApartmentOutlined,
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
  deleteRole,
  getRolePage,
  type RoleQuery,
  type RoleVO,
} from '@/services/org/role';
import AssignMenuModal from './AssignMenuModal';
import RoleFormModal from './RoleFormModal';
import {
  DATA_SCOPE_OPTIONS,
  ROLE_SCOPE_OPTIONS,
  ROLE_TYPE_OPTIONS,
  renderDataScope,
  renderRoleScope,
  renderRoleType,
} from './shared';
import './index.less';

/** 已选条件支持的筛选键 */
type FilterKey = 'name' | 'code' | 'roleType' | 'dataScope' | 'roleScope';

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
  const filterRef = useRef<RoleQuery>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RoleVO | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignRole, setAssignRole] = useState<RoleVO | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null); // 行删除独立 loading

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
    return arr;
  }, [name, code, roleType, dataScope, roleScope]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = () => {
    filterRef.current = {
      name: name.trim() || undefined,
      code: code.trim() || undefined,
      roleType,
      dataScope,
      roleScope,
    };
    actionRef.current?.reloadAndRest?.(); // 筛选后页码重置为 1
  };

  const doReset = () => {
    setName('');
    setCode('');
    setRoleType(undefined);
    setDataScope(undefined);
    setRoleScope(undefined);
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
    const next = { ...filterRef.current };
    delete next[key];
    filterRef.current = next;
    actionRef.current?.reloadAndRest?.(); // 移除条件后页码重置为 1
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  /** 删除：danger 操作，独立行内 loading，与表格 loading 分离 */
  const removeRole = (r: RoleVO) => {
    Modal.confirm({
      title: `删除角色「${r.name}」？`,
      // 文案明确「逻辑删除、不可恢复」；绑定校验文案依赖后端【待后端：BE-ROLE-OPT-02】
      content:
        '该操作为逻辑删除，删除后不可恢复，已绑定用户的访问将同步失效。确定删除吗？',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingId(r.id);
        try {
          const res = await deleteRole(r.id); // 【待后端：BE-ROLE-OPT-02】绑定数校验与友好报错
          message.success(res?.message || '删除成功');
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message);
          throw e; // 保持确认框开启（对齐菜单模块）
        } finally {
          setDeletingId(null);
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
      // 二期合规扩展位【待后端：BE-ROLE-OPT-09】
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
      width: 140,
      align: 'center',
      // ⚠️ 第一参是 dom，必须占位 _（历史坑）
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              style={{ padding: '0 4px' }}
              icon={<EditOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />}
              onClick={() => {
                setEditing(r);
                setFormOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="分配菜单">
            <Button
              type="text"
              size="small"
              style={{ padding: '0 4px' }}
              icon={
                <ApartmentOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
              }
              onClick={() => {
                setAssignRole(r);
                setAssignOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              type="text"
              size="small"
              danger
              style={{ padding: '0 4px' }}
              loading={deletingId === r.id} // 行操作 loading 与表格 loading 分离
              icon={<DeleteOutlined style={{ fontSize: 14 }} />}
              onClick={() => removeRole(r)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];
  // 操作列说明：当前 3 个操作未超过「更多」下拉阈值；
  // 【待后端：BE-ROLE-OPT-01】启停接口落地后追加第 4 个操作，届时收进 Dropdown「更多」

  return (
    <PageFill>
      <div
        style={{
          flex: 1,
          minHeight: 0, // 关键：允许本容器被子项压缩，flex 链路生效的前提
          background: '#fff',
          borderRadius: 8,
          padding: '12px 16px 8px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 筛选区：查询主按钮 / 重置次按钮（固定高度，flexShrink:0） */}
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

        {/* 修复：表格填充区——flex:1 撑满剩余高度；表格内部滚动 + 表头 sticky +
            分页钉底（样式见 .role-table-fill），不再依赖 FillTable 高度自适应 */}
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
            // 修复：只传横向滚动；纵向高度交由 .role-table-fill 的 flex 布局管理，
            // 避免与 FillTable 注入的 scroll.y 叠加产生双滚动条
            scroll={{ x: 1200 }}
            // 修复：固定每页 10 行
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
