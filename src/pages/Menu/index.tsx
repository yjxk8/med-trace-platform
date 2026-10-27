/**
 * 菜单管理（树表一屏 + 客户端类型 Tabs）—— 契约：菜单管理 v2 §三/§6.2/§6.5
 * - Tabs 三端（1平台Web/2销毁柜/3PDA）：⚠️ v2 clientType 为行级过滤——命中节点+祖先链保留，
 *   不再是 v1 的「按应用整树」；默认平台Web
 * - 筛选：keyword（name/routing/perms/componentName 模糊）/ menuType / status（均节点级+祖先链）
 * - 操作含「新增下级」：传父行给表单，落地 §6.2 clientType/menuType 默认继承
 * - 启/停文案 v2：正常/停用；后端消息「已启用」/「已停用」透传
 * - 物理删除：children 非空禁删 + tooltip；确认文案不出现「可恢复」
 * - children 归一 prune（叶子空数组→undefined）；展开受控默认全展开
 */
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { App, Button, Input, Modal, Select, Space, Tabs, Tooltip } from 'antd';
import type { Key } from 'react';
import { useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import {
  CLIENT_TYPE,
  deleteMenu,
  getMenuTree,
  MENU_STATUS,
  MENU_TYPE,
  type MenuTreeVO,
  setMenuStatus,
} from '@/services/org/menu';
import MenuFormModal from './MenuFormModal';
import {
  MENU_STATUS_OPTIONS,
  MENU_TYPE_OPTIONS,
  renderExternal,
  renderMenuType,
  renderStatus,
  renderVisible,
} from './shared';

/** 客户端 Tabs（§6.2：行级过滤视图；重置筛选不重置标签） */
const CLIENT_TABS = [
  { key: CLIENT_TYPE.WEB, label: '平台Web' },
  { key: CLIENT_TYPE.CABINET, label: '销毁柜' },
  { key: CLIENT_TYPE.PDA, label: 'PDA移动端' },
];

/** 树数据归一：空 children 数组 → undefined（防 Table 渲染空展开箭头） */
function prune(nodes: MenuTreeVO[]): MenuTreeVO[] {
  return nodes.map((n) => ({
    ...n,
    children: n.children?.length ? prune(n.children) : undefined,
  }));
}
/** 收集全部节点 id（加载后默认全展开） */
function collectIds(nodes: MenuTreeVO[], acc: Key[] = []): Key[] {
  nodes.forEach((n) => {
    acc.push(n.id);
    if (n.children?.length) collectIds(n.children, acc);
  });
  return acc;
}

export default function MenuManage() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const [clientType, setClientType] = useState<string>(CLIENT_TYPE.WEB);
  const [keyword, setKeyword] = useState('');
  const [menuType, setMenuType] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const filterRef = useRef<{
    keyword?: string;
    menuType?: string;
    status?: string;
    clientType?: string;
  }>({
    clientType: CLIENT_TYPE.WEB,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MenuTreeVO | null>(null);
  const [presetParentId, setPresetParentId] = useState<number | null>(null);
  const [parentRow, setParentRow] = useState<MenuTreeVO | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);

  const doSearch = () => {
    filterRef.current = {
      keyword: keyword.trim() || undefined,
      menuType,
      status,
      clientType,
    };
    actionRef.current?.reloadAndRest?.();
  };
  const doReset = () => {
    setKeyword('');
    setMenuType(undefined);
    setStatus(undefined);
    filterRef.current = { clientType }; // 保持当前标签
    actionRef.current?.reloadAndRest?.();
  };
  const onTabChange = (key: string) => {
    setClientType(key);
    filterRef.current = { ...filterRef.current, clientType: key };
    actionRef.current?.reloadAndRest?.();
  };

  const openCreate = (parent?: MenuTreeVO | null) => {
    setEditing(null);
    setParentRow(parent ?? null);
    setPresetParentId(parent?.id ?? null);
    setFormOpen(true);
  };

  const removeMenu = (r: MenuTreeVO) => {
    Modal.confirm({
      title: `删除菜单「${r.name}」？`,
      content: '删除后该菜单将从列表移除且无法找回，确定删除吗？', // 物理删除，不出现「可恢复」
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await deleteMenu(r.id);
          message.success(res?.message || '删除成功');
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message); // 如「存在子菜单，请先删除子菜单」
          throw e;
        }
      },
    });
  };

  const toggleStatus = (r: MenuTreeVO) => {
    const disable = String(r.status) === MENU_STATUS.NORMAL; // 当前正常 → 停用
    Modal.confirm({
      title: disable ? `停用「${r.name}」？` : `启用「${r.name}」？`,
      content: disable
        ? '停用后该菜单不再对外展示。'
        : '启用后该菜单恢复对外展示。',
      okText: disable ? '停用' : '启用',
      okButtonProps: disable ? { danger: true } : undefined,
      onOk: async () => {
        try {
          const res = await setMenuStatus(r.id, disable ? 2 : 1);
          message.success(res?.message || (disable ? '已停用' : '已启用'));
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message);
          throw e;
        }
      },
    });
  };

  const columns: ProColumns<MenuTreeVO>[] = [
    {
      title: '菜单名称',
      dataIndex: 'name',
      width: 260,
      render: (_, r) => (
        <span style={{ fontWeight: Number(r.parentId) === 0 ? 600 : 400 }}>
          {r.name || '-'}
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'menuType',
      width: 80,
      align: 'center',
      render: (_, r) => renderMenuType(r.menuType),
    },
    {
      title: '可见',
      dataIndex: 'isVisible',
      width: 60,
      align: 'center',
      render: (_, r) => renderVisible(r.isVisible),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 70,
      align: 'center',
      render: (_, r) => renderStatus(r.status),
    },
    {
      title: '排序',
      dataIndex: 'sort',
      width: 60,
      align: 'center',
      render: (_, r) => r.sort ?? '-',
    },
    {
      title: '路由地址',
      dataIndex: 'routing',
      width: 200,
      ellipsis: true,
      render: (_, r) => (
        <Space size={4}>
          {renderExternal(r.isExternal)}
          <span>{r.routing || '-'}</span>
        </Space>
      ),
    },
    {
      title: '组件',
      dataIndex: 'component',
      width: 150,
      ellipsis: true,
      render: (_, r) =>
        String(r.menuType) === MENU_TYPE.MENU ? r.component || '-' : '-',
    },
    {
      title: '权限标识',
      dataIndex: 'perms',
      width: 140,
      ellipsis: true,
      render: (_, r) => r.perms || '-',
    },
    {
      title: '操作',
      valueType: 'option',
      fixed: 'right',
      width: 170,
      align: 'center',
      // ⚠️ 第一参是 dom，必须占位 _（历史坑）
      render: (_, r) => {
        const hasChildren = !!r.children?.length;
        return (
          <Space size={0}>
            <Tooltip title="新增下级">
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={
                  <PlusOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
                }
                onClick={() => openCreate(r)}
              />
            </Tooltip>
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
                  setParentRow(null);
                  setPresetParentId(null);
                  setFormOpen(true);
                }}
              />
            </Tooltip>
            <Tooltip
              title={String(r.status) === MENU_STATUS.NORMAL ? '停用' : '启用'}
            >
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={
                  String(r.status) === MENU_STATUS.NORMAL ? (
                    <ArrowDownOutlined
                      style={{ color: '#8c8c8c', fontSize: 14 }}
                    />
                  ) : (
                    <ArrowUpOutlined
                      style={{ color: '#52c41a', fontSize: 14 }}
                    />
                  )
                }
                onClick={() => toggleStatus(r)}
              />
            </Tooltip>
            <Tooltip
              title={hasChildren ? '存在子菜单，请先删除子菜单' : '删除'}
            >
              <Button
                type="text"
                size="small"
                danger
                style={{ padding: '0 4px' }}
                disabled={hasChildren}
                icon={<DeleteOutlined style={{ fontSize: 14 }} />}
                onClick={() => removeMenu(r)}
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
          minHeight: 0,
          background: '#fff',
          borderRadius: 8,
          padding: '0 16px 4px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 客户端 Tabs：行级过滤（命中节点+祖先链，§6.2） */}
        <Tabs
          activeKey={clientType}
          onChange={onTabChange}
          items={CLIENT_TABS.map((t) => ({ key: t.key, label: t.label }))}
          style={{ marginBottom: 0 }}
        />

        {/* 筛选区：keyword / 类型 / 状态（clientType 已由 Tabs 承担） */}
        <div
          style={{ display: 'flex', gap: 8, marginBottom: 12, flexShrink: 0 }}
        >
          <Input
            allowClear
            style={{ width: 240 }}
            placeholder="名称 / 路由 / 权限标识 / 组件名"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={doSearch}
          />
          <Select
            allowClear
            style={{ width: 90 }}
            placeholder="类型"
            options={MENU_TYPE_OPTIONS}
            value={menuType}
            onChange={(v) => {
              setMenuType(v);
              filterRef.current = { ...filterRef.current, menuType: v };
              actionRef.current?.reloadAndRest?.();
            }}
          />
          <Select
            allowClear
            style={{ width: 90 }}
            placeholder="状态"
            options={MENU_STATUS_OPTIONS}
            value={status}
            onChange={(v) => {
              setStatus(v);
              filterRef.current = { ...filterRef.current, status: v };
              actionRef.current?.reloadAndRest?.();
            }}
          />
          <Button type="primary" onClick={doSearch}>
            查询
          </Button>
          <Button onClick={doReset}>重置</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ marginLeft: 'auto' }}
            onClick={() => openCreate(null)}
          >
            新增菜单
          </Button>
        </div>

        <FillTable
          pro
          reservedHeight={190}
          headerTitle="菜单列表"
          rowKey={(r: MenuTreeVO) => String(r.id)}
          actionRef={actionRef}
          columns={columns}
          search={false}
          pagination={false} // 树查询无分页
          options={{ reload: true, density: false, setting: false }}
          cardBordered={false}
          scroll={{ x: 1300 }}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: (keys: readonly Key[]) =>
              setExpandedKeys([...keys]),
          }}
          request={async (_params: { current?: number; pageSize?: number }) => {
            try {
              const tree = await getMenuTree({ ...filterRef.current });
              setExpandedKeys(collectIds(tree));
              return { data: prune(tree), total: tree.length, success: true };
            } catch (e) {
              message.error((e as Error).message);
              return { data: [], total: 0, success: false };
            }
          }}
        />
      </div>

      <MenuFormModal
        open={formOpen}
        editing={editing}
        presetParentId={presetParentId}
        parentRow={parentRow}
        defaultClientType={clientType}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          actionRef.current?.reload();
        }}
      />
    </PageFill>
  );
}
