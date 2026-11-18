/**
 * 菜单管理（树表一屏 + 客户端类型 Tabs）—— 契约：菜单管理 v2 §三/§6.2/§6.5
 * 当前态（表头固定 + 铺满终版）：
 * ① FillTable scroll.y 分体表头（header 物理固定 + body 内部滚动），无 CSS sticky；
 * ② reservedHeight=38：只预留紧凑表头（FillTable 默认按 pro 预留 148，是
 *   「工具栏+分页」的口径，本页已全部关闭 → 必须显式覆盖，否则表体少 110px 铺不满）；
 * ③ less 纵向 flex 拉伸链 + 行均摊：数据少时行摊满表格区，数据多时表体内部滚动；
 * ④ 无横向滚动：tableLayout="fixed"，菜单名称列弹性占满；
 * ⑤ 标题行固定在滚动区外（展开/收起/刷新图标），内置工具条已关闭；
 * ⑥ 已选条件 Tag：关键字随「查询」生效，类型/状态即时生效，单个可移除。
 * 保留：操作列 4 平铺 / 启停文案互斥 / Tabs 行级过滤 / 新增下级继承 /
 *   子菜单禁删 / 默认全展开 / 空状态引导
 */
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CompressOutlined,
  DeleteOutlined,
  EditOutlined,
  ExpandOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
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
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import type { Key } from 'react';
import { useMemo, useRef, useState } from 'react';
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
import './index.less';

/** 客户端 Tabs（§6.2：行级过滤视图；重置筛选不重置标签） */
const CLIENT_TABS = [
  { key: CLIENT_TYPE.WEB, label: '平台Web' },
  { key: CLIENT_TYPE.CABINET, label: '销毁柜' },
  { key: CLIENT_TYPE.PDA, label: 'PDA移动端' },
];

type FilterKey = 'keyword' | 'menuType' | 'status';

interface ActiveFilter {
  key: FilterKey;
  label: string;
}

/** Select 选项反查 label（S() 归一化对齐 shared 红线；菜单枚举值为 string） */
function findLabel(
  opts: { value: string | number; label: string }[],
  v: string | number | undefined,
): string {
  if (v == null) return '';
  return opts.find((o) => String(o.value) === String(v))?.label ?? String(v);
}

/** 树数据归一：空 children 数组 → undefined（防 Table 渲染空展开箭头） */
function prune(nodes: MenuTreeVO[]): MenuTreeVO[] {
  return nodes.map((n) => ({
    ...n,
    children: n.children?.length ? prune(n.children) : undefined,
  }));
}

/** 收集全部节点 id（默认全展开/「全部展开」按钮；String 归一化对齐 rowKey） */
function collectIds(nodes: MenuTreeVO[], acc: Key[] = []): Key[] {
  nodes.forEach((n) => {
    acc.push(String(n.id));
    if (n.children?.length) collectIds(n.children, acc);
  });
  return acc;
}

export default function MenuManage() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const treeRef = useRef<MenuTreeVO[]>([]);
  const [clientType, setClientType] = useState<string>(CLIENT_TYPE.WEB);
  const [keyword, setKeyword] = useState('');
  const [menuType, setMenuType] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [appliedKw, setAppliedKw] = useState('');
  const filterRef = useRef<{
    keyword?: string;
    menuType?: string;
    status?: string;
    clientType?: string;
  }>({ clientType: CLIENT_TYPE.WEB });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MenuTreeVO | null>(null);
  const [presetParentId, setPresetParentId] = useState<number | null>(null);
  const [parentRow, setParentRow] = useState<MenuTreeVO | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);

  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const arr: ActiveFilter[] = [];
    if (appliedKw) arr.push({ key: 'keyword', label: `关键字：${appliedKw}` });
    if (menuType != null)
      arr.push({
        key: 'menuType',
        label: `类型：${findLabel(MENU_TYPE_OPTIONS, menuType)}`,
      });
    if (status != null)
      arr.push({
        key: 'status',
        label: `状态：${findLabel(MENU_STATUS_OPTIONS, status)}`,
      });
    return arr;
  }, [appliedKw, menuType, status]);

  const doSearch = () => {
    const k = keyword.trim();
    setAppliedKw(k);
    filterRef.current = {
      keyword: k || undefined,
      menuType,
      status,
      clientType,
    };
    actionRef.current?.reloadAndRest?.();
  };

  const doReset = () => {
    setKeyword('');
    setAppliedKw('');
    setMenuType(undefined);
    setStatus(undefined);
    filterRef.current = { clientType };
    actionRef.current?.reloadAndRest?.();
  };

  const removeFilter = (key: FilterKey) => {
    if (key === 'keyword') {
      setKeyword('');
      setAppliedKw('');
    } else if (key === 'menuType') {
      setMenuType(undefined);
    } else if (key === 'status') {
      setStatus(undefined);
    }
    const next = { ...filterRef.current };
    delete next[key];
    filterRef.current = next;
    actionRef.current?.reloadAndRest?.();
  };

  const onMenuTypeChange = (v?: string) => {
    setMenuType(v);
    filterRef.current = { ...filterRef.current, menuType: v };
    actionRef.current?.reloadAndRest?.();
  };

  const onStatusChange = (v?: string) => {
    setStatus(v);
    filterRef.current = { ...filterRef.current, status: v };
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
      content: '删除后该菜单将从列表移除且无法找回，确定删除吗？',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await deleteMenu(r.id);
          message.success(res?.message || '删除成功');
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message);
          throw e;
        }
      },
    });
  };

  const toggleStatus = (r: MenuTreeVO) => {
    const disabled = String(r.status) === MENU_STATUS.DISABLED;
    const target = disabled ? 1 : 2;
    const doToggle = async () => {
      try {
        const res = await setMenuStatus(r.id, target);
        message.success(res?.message || (disabled ? '已启用' : '已停用'));
        actionRef.current?.reload();
      } catch (e) {
        message.error((e as Error).message);
        throw e;
      }
    };
    if (disabled) {
      doToggle().catch(() => undefined);
    } else {
      Modal.confirm({
        title: `停用菜单「${r.name}」？`,
        content:
          '停用后该菜单不再对外展示，已授权角色的授权记录保留（可随时重新启用）。',
        okText: '停用',
        okButtonProps: { danger: true },
        onOk: doToggle,
      });
    }
  };

  // 列宽：全表按百分比分配（与部门页一致）；合计 88%，剩余 12% 按比例摊给各列，
  // 宽屏下无集中空白；窄窗下各列同步收缩（注意见下方「窄窗提示」）
  const columns: ProColumns<MenuTreeVO>[] = [
    {
      title: '菜单名称',
      dataIndex: 'name',
      width: '24%',
      ellipsis: true,
      render: (_, r) => (
        <span style={{ fontWeight: Number(r.parentId) === 0 ? 600 : 400 }}>
          {r.name || '-'}
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'menuType',
      width: '5%',
      align: 'center',
      render: (_, r) => renderMenuType(r.menuType),
    },
    {
      title: '可见',
      dataIndex: 'isVisible',
      width: '4%',
      align: 'center',
      render: (_, r) => renderVisible(r.isVisible),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: '5%',
      align: 'center',
      render: (_, r) => renderStatus(r.status),
    },
    {
      title: (
        <span className="menu-sort-title">
          排序
          <Tooltip title="同级排序，值越小越靠前">
            <InfoCircleOutlined style={{ color: '#bfbfbf', marginLeft: 2 }} />
          </Tooltip>
        </span>
      ),
      dataIndex: 'sort',
      width: '5%',
      align: 'center',
      render: (_, r) => r.sort ?? '-',
    },
    {
      title: '路由地址',
      dataIndex: 'routing',
      width: '14%',
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
      width: '10%',
      ellipsis: true,
      render: (_, r) =>
        String(r.menuType) === MENU_TYPE.MENU ? r.component || '-' : '-',
    },
    {
      title: '权限标识',
      dataIndex: 'perms',
      width: '9%',
      ellipsis: true,
      render: (_, r) => r.perms || '-',
    },
    {
      title: '操作',
      valueType: 'option',
      width: '12%',
      align: 'center',
      render: (_, r) => {
        const hasChildren = !!r.children?.length;
        const disabled = String(r.status) === MENU_STATUS.DISABLED;
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
          padding: '0 16px 8px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Tabs
          activeKey={clientType}
          onChange={onTabChange}
          items={CLIENT_TABS.map((t) => ({ key: t.key, label: t.label }))}
          style={{ marginBottom: 0, flexShrink: 0 }}
        />
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 8,
            marginBottom: 8,
            flexShrink: 0,
          }}
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
            onChange={onMenuTypeChange}
          />
          <Select
            allowClear
            style={{ width: 90 }}
            placeholder="状态"
            options={MENU_STATUS_OPTIONS}
            value={status}
            onChange={onStatusChange}
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
        {activeFilters.length > 0 && (
          <div className="menu-filter-tags">
            <span className="menu-filter-tags__label">已选条件：</span>
            {activeFilters.map((f) => (
              <Tag
                key={f.key}
                closable
                className="menu-filter-tags__item"
                onClose={() => removeFilter(f.key)}
              >
                {f.label}
              </Tag>
            ))}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            margin: '2px 0 10px',
            flexShrink: 0,
          }}
        >
          <b style={{ fontSize: 15 }}>菜单列表</b>
          <Space style={{ marginLeft: 'auto' }} size={4}>
            <Tooltip title="全部展开">
              <Button
                icon={<ExpandOutlined />}
                onClick={() => setExpandedKeys(collectIds(treeRef.current))}
              />
            </Tooltip>
            <Tooltip title="全部收起">
              <Button
                icon={<CompressOutlined />}
                onClick={() => setExpandedKeys([])}
              />
            </Tooltip>
            <Tooltip title="刷新">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => actionRef.current?.reload()}
              />
            </Tooltip>
          </Space>
        </div>
        {/* ★ 表头固定 + 铺满终版：FillTable scroll.y 分体表头（header 固定 + body 内部滚动）；
            reservedHeight=38 只预留紧凑表头（默认 148 按「工具栏+分页」扣，本页已关闭） */}
        <div className="menu-table-fill">
          <FillTable
            pro
            size="small"
            reservedHeight={38}
            rowKey={(r: MenuTreeVO) => String(r.id)}
            actionRef={actionRef}
            columns={columns}
            search={false}
            pagination={false}
            tableLayout="fixed"
            options={false}
            cardBordered={false}
            expandable={{
              expandedRowKeys: expandedKeys,
              onExpandedRowsChange: (keys: readonly Key[]) =>
                setExpandedKeys([...keys]),
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无菜单"
                >
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => openCreate(null)}
                  >
                    新增菜单
                  </Button>
                </Empty>
              ),
            }}
            request={async (_params: {
              current?: number;
              pageSize?: number;
            }) => {
              try {
                const tree = await getMenuTree({ ...filterRef.current });
                treeRef.current = tree;
                setExpandedKeys(collectIds(tree));
                return { data: prune(tree), total: tree.length, success: true };
              } catch (e) {
                message.error((e as Error).message);
                return { data: [], total: 0, success: false };
              }
            }}
          />
        </div>
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
