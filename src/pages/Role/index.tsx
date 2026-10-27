/**
 * 角色管理（分页表 + 多条件筛选）—— 契约：角色管理 v1.0 §2.2/§2.3/§7
 * - 手动筛选区（对齐菜单模块风格）：name/code/roleType/dataScope/roleScope，filterRef 收集后 reload
 * - 分页：后端返回 IPage{records,total}（§2.3，无统一 wrapper），request 回调内适配
 *   {data,total,success}——与 ProTable 约定对齐，页面层不感知后端结构
 * - 删除为逻辑删（del_flag=2），本期无恢复/启停接口【待后端】，确认文案不承诺可恢复
 * - t_user_role 未上线，删除暂无绑定校验【后端 TODO】
 * - 操作列 ⚠️ 第一参是 dom，必须占位 _（历史坑，沿用菜单模块）
 */
import {
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { App, Button, Input, Modal, Select, Space, Tooltip } from 'antd';
import { useRef, useState } from 'react';
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

export default function RoleManage() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);

  // ===== 筛选态（与菜单模块同构：state 控制 UI，filterRef 供 request 读取）=====
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

  const doSearch = () => {
    filterRef.current = {
      name: name.trim() || undefined,
      code: code.trim() || undefined,
      roleType,
      dataScope,
      roleScope,
    };
    actionRef.current?.reloadAndRest?.();
  };

  const doReset = () => {
    setName('');
    setCode('');
    setRoleType(undefined);
    setDataScope(undefined);
    setRoleScope(undefined);
    filterRef.current = {};
    actionRef.current?.reloadAndRest?.();
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const removeRole = (r: RoleVO) => {
    Modal.confirm({
      title: `删除角色「${r.name}」？`,
      // 逻辑删除但本期无恢复入口；t_user_role 未上线暂无绑定校验（后端 TODO）
      content: '删除后该角色不再可用，已绑定用户的访问将同步失效。确定删除吗？',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await deleteRole(r.id);
          message.success(res?.message || '删除成功');
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message);
          throw e;
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
      title: '排序',
      dataIndex: 'sort',
      width: 60,
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
              icon={<DeleteOutlined style={{ fontSize: 14 }} />}
              onClick={() => removeRole(r)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <PageFill>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          background: '#fff',
          borderRadius: 8,
          padding: '0 16px 4px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 筛选区：name / code / 三枚举 */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 12,
            flexShrink: 0,
            paddingTop: 12,
          }}
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

        <FillTable
          pro
          reservedHeight={190}
          headerTitle="角色列表"
          rowKey={(r: RoleVO) => r.id}
          actionRef={actionRef}
          columns={columns}
          search={false}
          options={{ reload: true, density: false, setting: false }}
          cardBordered={false}
          scroll={{ x: 1200 }}
          request={async (params: { current?: number; pageSize?: number }) => {
            try {
              // §2.3：后端返回 IPage 原始结构，此处做 ProTable 适配
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
