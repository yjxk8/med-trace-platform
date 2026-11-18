/**
 * 部门管理(组织架构)—— 与菜单管理同构
 * 当前态(2026-11-17 简化版):
 * ① 筛选区仅 部门名称/状态:机构与部门编码搜索项移除(产品定版)——
 *    机构为固定数据域(恒锁定登录所选机构 getMiId(),与用户管理页同口径;
 *    type1 换机构走顶栏 OrgSwitcher 整页刷新,本页随刷新切换);
 *    部门编码列保留(药房等模块按编码引用),仅不再作为检索条件;
 * ② ★机构名唯一展示位 = 「部门列表」标题后的蓝色 Tag(显眼):
 *    解析链 perm.orgName → orgs 匹配 → vo.org.miName → OrgSwitcher detail
 *    翻译缓存 miName:{id}(同 key 复用)→ 占位「机构 {id}」——全本地解析零请求;
 * ③ FillTable scroll.y 分体表头(header 物理固定 + body 内部滚动),无 CSS sticky;
 * ④ reservedHeight=38:只预留紧凑表头(默认 96 按「工具栏+分页」扣,本页已全关);
 * ⑤ less 纵向 flex 拉伸链 + 行均摊:数据少时行摊满表格区,数据多时表体内部滚动;
 * ⑥ 无横向滚动:tableLayout="fixed",列宽百分比;
 * ⑦ 操作列 4 图标(新增下级/编辑/删除/分配角色),三级上限禁用带原因;
 * ⑧ 已选条件 Tag(名称/状态)/排序列头提示/顶级加粗/展开收起图标化/空状态引导。
 * 保留:miId 契约必传拦截/前端关键词过滤(保子树+祖先链)/搜索自动全展开/
 * 级联软删确认/保存后保留展开 + 新建下级展开父级
 */
import {
  BankOutlined,
  CompressOutlined,
  DeleteOutlined,
  EditOutlined,
  ExpandOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useModel } from '@umijs/max';
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
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import {
  type DeptTreeNode,
  deleteDept,
  getDeptTree,
} from '@/services/org/dept';
import { getMiId } from '@/services/tenant';
import DeptFormModal from './DeptFormModal';
import { DEPT_STATUS_OPTIONS, renderDeptStatus } from './shared';
import './index.less';

/** 递归收集「有子节点」的所有 id(展开全部/搜索自动展开) */
const collectExpandableIds = (nodes: DeptTreeNode[]): React.Key[] =>
  nodes.flatMap((n) =>
    n.children?.length ? [n.id, ...collectExpandableIds(n.children)] : [],
  );

/** 递归统计节点总数 */
const countNodes = (nodes: DeptTreeNode[]): number =>
  nodes.reduce((sum, n) => sum + 1 + countNodes(n.children ?? []), 0);

/** 机构名缓存 TTL(复用 OrgSwitcher miName:{id} 缓存,同 key 同源) */
const NAME_TTL = 24 * 3600 * 1000;

type FilterKey = 'nameKw' | 'deptStatus';

interface ActiveFilter {
  key: FilterKey;
  label: string;
}

export default function DeptManage() {
  const { message } = App.useApp();
  const { initialState } = useModel('@@initialState');
  const state = initialState as any;
  const perm = state?.perm;
  const vo = state?.login;

  /** 固定数据域:登录所选机构(2026-11-17 起不再提供机构筛选) */
  const initialMiId = getMiId();

  const [treeData, setTreeData] = useState<DeptTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState<{
    deptStatus?: number;
    nameKw: string;
  }>({ nameKw: '' });
  const [fName, setFName] = useState('');
  const [fStatus, setFStatus] = useState<number | undefined>(undefined);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DeptTreeNode | null>(null);
  const [createParent, setCreateParent] = useState<DeptTreeNode | null>(null);

  /**
   * ★机构名解析链(全本地,零请求):
   * ① perm.orgName(type1 选机构后)→ ② orgs 匹配 miId(type1/2)
   * → ③ vo.org.miName(后端 LoginVO 契约位)→ ④ OrgSwitcher detail 翻译缓存
   * (key miName:{id},type3 首次进系统时已写入)→ 占位「机构 {id}」
   */
  const orgName = useMemo(() => {
    if (perm?.orgName) return String(perm.orgName);
    const hit = ((vo?.orgs ?? []) as any[]).find(
      (o) => Number(o.org.miId) === Number(initialMiId),
    );
    if (hit?.org?.miName) return hit.org.miName;
    if (vo?.org?.miName) return String(vo.org.miName);
    try {
      const cached =
        initialMiId != null
          ? localStorage.getItem(`miName:${initialMiId}`)
          : null;
      if (cached) {
        const { name, ts } = JSON.parse(cached);
        if (name && Date.now() - Number(ts) < NAME_TTL) return String(name);
      }
    } catch {
      /* 缓存损坏 → 走占位 */
    }
    return initialMiId ? `机构 ${initialMiId}` : '-';
  }, [perm, vo, initialMiId]);

  const loadTree = async (
    miId: number,
    deptStatus?: number,
    keepExpansion = false,
  ) => {
    if (!miId) return;
    setLoading(true);
    try {
      const data = await getDeptTree({ miId, deptStatus });
      setTreeData(data ?? []);
      const firstLevel = (data ?? [])
        .filter((n) => n.children?.length)
        .map((n) => n.id);
      setExpandedKeys((prev) =>
        keepExpansion
          ? Array.from(new Set([...prev, ...firstLevel]))
          : firstLevel,
      );
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialMiId) {
      message.error('未获取到机构ID(miId),请重新登录');
      return;
    }
    loadTree(initialMiId, undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** 名称关键词:前端过滤,保留匹配节点的完整子树与祖先路径(编码过滤已随搜索项移除) */
  const filteredTree = useMemo(() => {
    const nameK = applied.nameKw.trim().toLowerCase();
    if (!nameK) return treeData;
    const walk = (list: DeptTreeNode[]): DeptTreeNode[] => {
      const res: DeptTreeNode[] = [];
      for (const n of list) {
        const kids = walk(n.children ?? []);
        const selfMatch = (n.deptName ?? '').toLowerCase().includes(nameK);
        if (selfMatch) {
          res.push({ ...n, children: n.children ?? [] });
        } else if (kids.length > 0) {
          res.push({ ...n, children: kids });
        }
      }
      return res;
    };
    return walk(treeData);
  }, [treeData, applied.nameKw]);

  /** 有关键词时自动全部展开,保证搜索结果可见 */
  const effectiveExpandedKeys = applied.nameKw.trim()
    ? collectExpandableIds(filteredTree)
    : expandedKeys;

  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const arr: ActiveFilter[] = [];
    if (applied.nameKw.trim())
      arr.push({ key: 'nameKw', label: `名称:${applied.nameKw.trim()}` });
    if (applied.deptStatus != null) {
      const label =
        DEPT_STATUS_OPTIONS.find(
          (o) => String(o.value) === String(applied.deptStatus),
        )?.label ?? String(applied.deptStatus);
      arr.push({ key: 'deptStatus', label: `状态:${label}` });
    }
    return arr;
  }, [applied]);

  const doSearch = () => {
    setApplied({ deptStatus: fStatus, nameKw: fName.trim() });
    loadTree(initialMiId, fStatus);
  };

  const doReset = () => {
    setFName('');
    setFStatus(undefined);
    setApplied({ nameKw: '' });
    loadTree(initialMiId, undefined);
  };

  const removeFilter = (key: FilterKey) => {
    if (key === 'nameKw') {
      setFName('');
      setApplied((p) => ({ ...p, nameKw: '' }));
    } else if (key === 'deptStatus') {
      setFStatus(undefined);
      setApplied((p) => {
        const { deptStatus: _omit, ...rest } = p;
        return rest;
      });
      loadTree(initialMiId, undefined, true);
    }
  };

  const removeDept = (r: DeptTreeNode) => {
    Modal.confirm({
      title: `删除部门「${r.deptName}」?`,
      content: '将同时删除其全部下级部门(级联删除),确定删除?',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await deleteDept(r.id);
          message.success(res?.message || '删除成功');
          loadTree(initialMiId, applied.deptStatus, true);
        } catch (e) {
          message.error((e as Error).message);
          throw e;
        }
      },
    });
  };

  const reloadAfterSave = (expandId?: number) => {
    setFormOpen(false);
    setEditing(null);
    setCreateParent(null);
    if (expandId != null) {
      setExpandedKeys((prev) => Array.from(new Set([...prev, expandId])));
    }
    loadTree(initialMiId, applied.deptStatus, true);
  };

  const openCreate = (parent?: DeptTreeNode | null) => {
    setEditing(null);
    setCreateParent(parent ?? null);
    setFormOpen(true);
  };

  // 列定义(与原版一致;部门编码列保留——药房按编码引用,仅检索项移除)
  const columns: ColumnsType<DeptTreeNode> = [
    {
      title: '部门名称',
      dataIndex: 'deptName',
      width: '32%',
      ellipsis: true,
      render: (_, r) => (
        <span style={{ fontWeight: Number(r.parentId) === 0 ? 600 : 400 }}>
          {r.deptName || '-'}
        </span>
      ),
    },
    {
      title: '部门编码',
      dataIndex: 'deptCode',
      width: '14%',
      ellipsis: true,
      render: (_, r) => r.deptCode || '-',
    },
    {
      title: (
        <span className="dept-sort-title">
          排序
          <Tooltip title="同级排序,值越小越靠前">
            <InfoCircleOutlined style={{ color: '#bfbfbf', marginLeft: 2 }} />
          </Tooltip>
        </span>
      ),
      dataIndex: 'sortOrder',
      width: '7%',
      align: 'center',
      render: (_, r) => r.sortOrder ?? '-',
    },
    {
      title: '状态',
      dataIndex: 'deptStatus',
      width: '7%',
      align: 'center',
      render: (_, r) => renderDeptStatus(r.deptStatus),
    },
    {
      title: '操作',
      width: '12%',
      align: 'center',
      render: (_, record) => {
        const canAddChild = record.deptLevel <= 2;
        return (
          <Space size={0}>
            <Tooltip
              title={canAddChild ? '新增下级' : '已达三级上限,不可再挂下级'}
            >
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                disabled={!canAddChild}
                icon={
                  <PlusOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
                }
                onClick={() => openCreate(record)}
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
                  setEditing(record);
                  setCreateParent(null);
                  setFormOpen(true);
                }}
              />
            </Tooltip>
            <Tooltip title="删除(级联删除全部下级)">
              <Button
                type="text"
                size="small"
                danger
                style={{ padding: '0 4px' }}
                icon={<DeleteOutlined style={{ fontSize: 14 }} />}
                onClick={() => removeDept(record)}
              />
            </Tooltip>
            <Tooltip title="分配角色">
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={
                  <TeamOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
                }
                onClick={() => message.info('分配角色功能开发中')}
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
          padding: '12px 16px 8px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 筛选区(2026-11-17:机构/部门编码搜索项移除,产品定版);
            机构为固定数据域(恒锁定登录所选机构),不进筛选/已选条件 */}
        <div
          style={{ display: 'flex', gap: 8, marginBottom: 8, flexShrink: 0 }}
        >
          <Input
            allowClear
            style={{ width: 220 }}
            placeholder="部门名称"
            value={fName}
            onChange={(e) => setFName(e.target.value)}
            onPressEnter={doSearch}
          />
          <Select
            allowClear
            style={{ width: 110 }}
            placeholder="状态"
            options={DEPT_STATUS_OPTIONS}
            value={fStatus}
            onChange={(v) => setFStatus(v)}
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
            新建部门
          </Button>
        </div>

        {activeFilters.length > 0 && (
          <div className="dept-filter-tags">
            <span className="dept-filter-tags__label">已选条件:</span>
            {activeFilters.map((f) => (
              <Tag
                key={f.key}
                closable
                className="dept-filter-tags__item"
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
            minWidth: 0,
          }}
        >
          <b style={{ fontSize: 15, flexShrink: 0 }}>部门列表</b>
          {/* ★机构名唯一展示位(2026-11-17:搜索区机构下拉移除后):
              蓝 Tag + 图标显眼展示;超长省略 + Tooltip 全名 */}
          <Tooltip title={orgName}>
            <Tag
              color="blue"
              icon={<BankOutlined />}
              style={{
                marginLeft: 12,
                marginInlineEnd: 0,
                maxWidth: 400,
                fontSize: 14,
                fontWeight: 600, // ★加粗
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {orgName}
            </Tag>
          </Tooltip>
          <span
            style={{
              color: '#8c8c8c',
              marginLeft: 12,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            当前显示 {countNodes(filteredTree)} 个部门
          </span>
          <Space style={{ marginLeft: 'auto' }} size={4}>
            <Tooltip title="全部展开">
              <Button
                icon={<ExpandOutlined />}
                onClick={() => setExpandedKeys(collectExpandableIds(treeData))}
              />
            </Tooltip>
            <Tooltip title="全部收起">
              <Button
                icon={<CompressOutlined />}
                onClick={() => setExpandedKeys([])}
              />
            </Tooltip>
          </Space>
        </div>

        {/* 表头固定 + 铺满终版:FillTable scroll.y 分体表头;
            reservedHeight=38 只预留紧凑表头 */}
        <div className="dept-table-fill">
          <FillTable
            rowKey="id"
            size="small"
            reservedHeight={38}
            loading={loading}
            dataSource={filteredTree}
            pagination={false}
            tableLayout="fixed"
            expandedRowKeys={effectiveExpandedKeys}
            onExpandedRowsChange={(keys: readonly React.Key[]) =>
              setExpandedKeys([...keys])
            }
            columns={columns}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无部门"
                >
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => openCreate(null)}
                  >
                    新建部门
                  </Button>
                </Empty>
              ),
            }}
          />
        </div>
      </div>

      <DeptFormModal
        open={formOpen}
        editing={editing}
        parent={createParent}
        defaultMiId={initialMiId}
        treeData={treeData}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setCreateParent(null);
        }}
        onSaved={reloadAfterSave}
      />
    </PageFill>
  );
}
