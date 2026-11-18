/**
 * 用户组管理（列表页）—— 范式对齐 User/Role 页：
 * PageFill + 白卡 + 手动筛选行 + 已选条件 Tag 行 + FillTable(pro) + App.useApp
 * 契约：《用户组管理 · 前端开发方案 v1》§3；后端 v1.1 收缩口径（④⑤⑥⑦ 封存 → 占位）
 *
 * 差异执行（对齐工程现行规则）：
 * - 启停/删除用 Modal.confirm（失败 toast + throw 保持开启），非方案稿的 Popconfirm；
 * - 机构筛选暂不渲染（反馈② 无机构 options 接口）；
 * - 绑定授权/查看审计：disabled + Tooltip 占位（不隐藏，能力位可见）；
 * - 麻精敏感组整行浅红底（rowClassName + .narcotic-row）。
 * 红线：删除文案必须含「将同时移出全部组内成员，且不可恢复」；启用过期组 → 后端文案原样 toast。
 * ⚠️ FillTable 非泛型：回调参数显式注解（TS7006）
 */
import {
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
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
import { useMemo, useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import {
  changeUserGroupStatus,
  deleteUserGroup,
  fetchUserGroupDetail,
  fetchUserGroupPage,
  GROUP_STATUS,
  NARCOTIC,
  type UserGroupVO,
} from '@/services/org/userGroup';
import GrantDrawer from './GrantDrawer';
import GroupFormModal from './GroupFormModal';
import MemberDrawer from './MemberDrawer';
import {
  fmtFull,
  GROUP_STATUS_OPTIONS,
  GROUP_TYPE_OPTIONS,
  NARCOTIC_OPTIONS,
  renderAutoExpire,
  renderGroupStatus,
  renderGroupType,
  renderNarcotic,
  renderValidToCell,
} from './shared';
import './index.less';
import { history } from '@umijs/max';

type FilterKey = 'keyword' | 'groupType' | 'isNarcoticGroup' | 'status';

interface ActiveFilter {
  key: FilterKey;
  label: string;
}

function findLabel(
  opts: { value: string; label: string }[],
  v: string | number | undefined | null,
): string {
  if (v == null) return '';
  return opts.find((o) => String(o.value) === String(v))?.label ?? String(v);
}

export default function UserGroupManage() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);

  // ===== 筛选（受控态 + filterRef 快照，查询时生效）=====
  const [keyword, setKeyword] = useState('');
  const [groupType, setGroupType] = useState<string | undefined>(undefined);
  const [narcotic, setNarcotic] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const filterRef = useRef<{
    keyword?: string;
    groupType?: string;
    isNarcoticGroup?: string;
    status?: string;
  }>({});
  // 【反馈②】机构（miId）筛选暂不渲染：无机构 options 接口；后端支持后补 Select

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserGroupVO | null>(null);
  const [drawerGroup, setDrawerGroup] = useState<UserGroupVO | null>(null);
  const [grantGroup, setGrantGroup] = useState<UserGroupVO | null>(null);
  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const arr: ActiveFilter[] = [];
    const k = keyword.trim();
    if (k) arr.push({ key: 'keyword', label: `关键字：${k}` });
    if (groupType != null)
      arr.push({
        key: 'groupType',
        label: `组类型：${findLabel(GROUP_TYPE_OPTIONS, groupType)}`,
      });
    if (narcotic != null)
      arr.push({
        key: 'isNarcoticGroup',
        label: `麻精组：${findLabel(NARCOTIC_OPTIONS, narcotic)}`,
      });
    if (status != null)
      arr.push({
        key: 'status',
        label: `状态：${findLabel(GROUP_STATUS_OPTIONS, status)}`,
      });
    return arr;
  }, [keyword, groupType, narcotic, status]);

  const doSearch = () => {
    filterRef.current = {
      keyword: keyword.trim() || undefined,
      groupType,
      isNarcoticGroup: narcotic,
      status,
    };
    actionRef.current?.reloadAndRest?.();
  };

  const doReset = () => {
    setKeyword('');
    setGroupType(undefined);
    setNarcotic(undefined);
    setStatus(undefined);
    filterRef.current = {};
    actionRef.current?.reloadAndRest?.();
  };

  const removeFilter = (key: FilterKey) => {
    if (key === 'keyword') setKeyword('');
    else if (key === 'groupType') setGroupType(undefined);
    else if (key === 'isNarcoticGroup') setNarcotic(undefined);
    else if (key === 'status') setStatus(undefined);
    const next = { ...filterRef.current };
    delete next[key];
    filterRef.current = next;
    actionRef.current?.reloadAndRest?.();
  };

  const openEdit = (r: UserGroupVO) => {
    setEditing(r);
    setFormOpen(true);
    // 详情覆盖回显（防列表行缺字段），失败保留行数据兜底
    fetchUserGroupDetail(r.id)
      .then(setEditing)
      .catch(() => {});
  };

  // ===== 行操作（失败 toast 后端原文 + throw 保持确认框开启）=====
  const removeGroup = (r: UserGroupVO) => {
    Modal.confirm({
      title: `删除用户组「${r.groupName}」？`,
      content:
        '删除用户组将同时移出全部组内成员，且不可恢复（成员关系为物理删除），确定删除？',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteUserGroup(r.id);
          message.success('删除成功');
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message);
          throw e;
        }
      },
    });
  };

  const toggleStatus = (r: UserGroupVO) => {
    const disable = String(r.status) === GROUP_STATUS.NORMAL;
    Modal.confirm({
      title: disable
        ? `停用用户组「${r.groupName}」？`
        : `启用用户组「${r.groupName}」？`,
      content: disable
        ? '停用后组内成员将无法维护。'
        : '启用后组内成员可正常维护（过期组启用将被后端拦截并提示续期）。',
      okText: disable ? '停用' : '启用',
      okButtonProps: disable ? { danger: true } : undefined,
      onOk: async () => {
        try {
          const res = await changeUserGroupStatus(r.id, disable ? 2 : 1);
          message.success(res?.message || (disable ? '已停用' : '已启用'));
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message); // 过期组启用 → 后端文案原样
          throw e;
        }
      },
    });
  };

  // ===== 列定义=====
  const columns: ProColumns<UserGroupVO>[] = [
    {
      title: '组编码',
      dataIndex: 'groupCode',
      width: '9%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => r.groupCode || '-',
    },
    {
      title: '组名称',
      dataIndex: 'groupName',
      width: '12%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => r.groupName || '-',
    },
    {
      title: '组类型',
      dataIndex: 'groupType',
      width: '7%',
      align: 'center',
      render: (_, r) => renderGroupType(r.groupType),
    },
    {
      title: '麻精组',
      dataIndex: 'isNarcoticGroup',
      width: '7%',
      align: 'center',
      render: (_, r) => renderNarcotic(r.isNarcoticGroup),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: '6%',
      align: 'center',
      render: (_, r) => renderGroupStatus(r.status),
    },
    {
      title: '成员数',
      dataIndex: 'memberCount',
      width: '6%',
      align: 'center',
      // 主入口：点击打开成员 Drawer（方案 §3.1）
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          onClick={() => setDrawerGroup(r)}
        >
          {r.memberCount ?? 0}
        </Button>
      ),
    },
    {
      title: '负责人',
      dataIndex: 'ownerName',
      width: '9%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => r.ownerName || '-',
    },
    {
      title: '失效日期',
      dataIndex: 'validTo',
      width: '12%',
      align: 'center',
      render: (_, r) => renderValidToCell(r.validTo),
    },
    {
      title: '到期动作',
      dataIndex: 'autoExpireAction',
      width: '9%',
      align: 'center',
      render: (_, r) => renderAutoExpire(r.autoExpireAction),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: '11%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => fmtFull(r.createTime),
    },
    {
      title: '操作',
      valueType: 'option',
      width: '12%',
      align: 'center',
      // 口径：≤4 平铺（编辑/成员管理/启停），删除+占位收「更多」Dropdown
      // ⚠️ 第一参是 dom 节点，必须占位 _（历史坑）
      render: (_, r) => {
        const items: MenuProps['items'] = [
          {
            key: 'bind',
            icon: <ApartmentOutlined />,
            label: '绑定授权',
            onClick: () => setGrantGroup(r), // v1.2 解封④
          },
          {
            key: 'audit',
            icon: <TeamOutlined />,
            label: '查看审计',
            onClick: () => history.push('/org/audit/auth'),
          },
          { type: 'divider' as const },
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            danger: true,
            label: '删除',
            onClick: () => removeGroup(r),
          },
        ];
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
            <Tooltip title="成员管理">
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={
                  <TeamOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
                }
                onClick={() => setDrawerGroup(r)}
              />
            </Tooltip>
            <Tooltip
              title={String(r.status) === GROUP_STATUS.NORMAL ? '停用' : '启用'}
            >
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px', color: '#8c8c8c' }}
                onClick={() => toggleStatus(r)}
              >
                {String(r.status) === GROUP_STATUS.NORMAL ? '停用' : '启用'}
              </Button>
            </Tooltip>
            <Dropdown menu={{ items }}>
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={<MoreIcon />}
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
          minHeight: 0,
          background: '#fff',
          borderRadius: 8,
          padding: '12px 16px 8px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 筛选区（机构筛选待反馈②接口） */}
        <div
          style={{ display: 'flex', gap: 8, marginBottom: 8, flexShrink: 0 }}
        >
          <Input
            allowClear
            style={{ width: 240 }}
            placeholder="组名称 / 组编码"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={doSearch}
          />
          <Select
            allowClear
            style={{ width: 120 }}
            placeholder="组类型"
            options={GROUP_TYPE_OPTIONS}
            value={groupType}
            onChange={(v) => setGroupType(v)}
          />
          <Select
            allowClear
            style={{ width: 120 }}
            placeholder="麻精组"
            options={NARCOTIC_OPTIONS}
            value={narcotic}
            onChange={(v) => setNarcotic(v)}
          />
          <Select
            allowClear
            style={{ width: 110 }}
            placeholder="状态"
            options={GROUP_STATUS_OPTIONS}
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
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            新建用户组
          </Button>
        </div>
        {activeFilters.length > 0 && (
          <div className="group-filter-tags">
            <span className="group-filter-tags__label">已选条件：</span>
            {activeFilters.map((f) => (
              <Tag
                key={f.key}
                closable
                className="group-filter-tags__item"
                onClose={() => removeFilter(f.key)}
              >
                {f.label}
              </Tag>
            ))}
          </div>
        )}
        <div className="group-table-fill">
          <FillTable
            pro
            headerTitle="用户组列表"
            rowKey={(r: UserGroupVO) => String(r.id)}
            actionRef={actionRef}
            columns={columns}
            search={false}
            options={{ reload: true, density: false, setting: false }}
            cardBordered={false}
            tableLayout="fixed"
            pagination={{
              pageSize: 10,
              defaultPageSize: 10,
              showSizeChanger: false,
            }}
            // 麻精敏感组整行浅红底（§3.1）
            rowClassName={(r: UserGroupVO) =>
              String(r.isNarcoticGroup) === NARCOTIC.YES ? 'narcotic-row' : ''
            }
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无用户组"
                >
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    新建用户组
                  </Button>
                </Empty>
              ),
            }}
            request={async (params: {
              current?: number;
              pageSize?: number;
            }) => {
              try {
                const res = await fetchUserGroupPage({
                  page: params.current ?? 1,
                  size: params.pageSize ?? 10,
                  ...filterRef.current,
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
      <GroupFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          actionRef.current?.reload();
        }}
      />
      <MemberDrawer
        open={!!drawerGroup}
        group={drawerGroup}
        onClose={() => setDrawerGroup(null)}
        onMembersChanged={() => actionRef.current?.reload()}
      />
      <GrantDrawer
        open={!!grantGroup}
        group={grantGroup}
        onClose={() => setGrantGroup(null)}
      />
    </PageFill>
  );
}

/** 「更多」图标小包装（保持列定义可读） */
function MoreIcon() {
  return <MoreOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />;
}
