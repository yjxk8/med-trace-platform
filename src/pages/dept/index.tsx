/**
 * 部门管理（组织架构）—— 按当前工程风格重构（对齐 Mi/MiConfig 页面模式）
 * 本轮修复：机构下拉动态化（原硬编码 miId=12）/ message 走 App.useApp() /
 * 筛选与弹窗表单实例分离（原共用 form 互相污染）/ columns 类型化常量（原 as 断言）/
 * Modal.confirm 统一删除模式 / 保存后保留展开状态
 * 业务规则：最多三级（deptLevel≤2 才可新增下级）；编辑不允许改上级部门（服务端约束）
 */
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Input, Modal, Select, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import FillTable from '@/components/FillTable';
import MiParentSelect from '@/components/MiParentSelect';
import PageFill from '@/components/PageFill';
import {
  createDept,
  type DeptTreeNode,
  deleteDept,
  getDeptTree,
  updateDept,
} from '@/services/org/dept';
import { getMiId } from '@/services/tenant';
import DeptFormModal from './DeptFormModal';
import { DEPT_STATUS_OPTIONS, renderDeptStatus } from './shared';

/** 递归收集"有子节点"的所有 id（展开全部/搜索自动展开） */
const collectExpandableIds = (nodes: DeptTreeNode[]): React.Key[] =>
  nodes.flatMap((n) =>
    n.children?.length ? [n.id, ...collectExpandableIds(n.children)] : [],
  );

/** 递归统计节点总数 */
const countNodes = (nodes: DeptTreeNode[]): number =>
  nodes.reduce((sum, n) => sum + 1 + countNodes(n.children ?? []), 0);

export default function DeptManage() {
  const { message } = App.useApp();
  const initialMiId = getMiId();

  // ===== 数据与已生效筛选（服务端 miId/deptStatus + 前端关键词） =====
  const [treeData, setTreeData] = useState<DeptTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState<{
    miId: number;
    deptStatus?: number;
    nameKw: string;
    codeKw: string;
  }>({ miId: initialMiId ?? 0, nameKw: '', codeKw: '' });

  // ===== 筛选输入态（Mi 同款原生 state，不建 Form——与弹窗表单实例彻底分离） =====
  const [fMiId, setFMiId] = useState<number | undefined>(
    initialMiId ?? undefined,
  );
  const [fName, setFName] = useState('');
  const [fCode, setFCode] = useState('');
  const [fStatus, setFStatus] = useState<number | undefined>(undefined);

  // ===== 展开 & 弹窗 =====
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DeptTreeNode | null>(null);
  const [createParent, setCreateParent] = useState<DeptTreeNode | null>(null);

  const loadTree = async (
    miId: number,
    deptStatus?: number,
    keepExpansion = false,
  ) => {
    if (!miId) return; // 契约 miId 必传：本地拦截不发请求
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
      message.error('未获取到机构ID（miId），请重新登录');
      return;
    }
    loadTree(initialMiId, undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** 名称/编码关键词：前端过滤，保留匹配节点的完整子树与祖先路径 */
  const filteredTree = useMemo(() => {
    const nameK = applied.nameKw.trim().toLowerCase();
    const codeK = applied.codeKw.trim().toLowerCase();
    if (!nameK && !codeK) return treeData;
    const walk = (list: DeptTreeNode[]): DeptTreeNode[] => {
      const res: DeptTreeNode[] = [];
      for (const n of list) {
        const kids = walk(n.children ?? []);
        const selfMatch =
          (!nameK || (n.deptName ?? '').toLowerCase().includes(nameK)) &&
          (!codeK || (n.deptCode ?? '').toLowerCase().includes(codeK));
        if (selfMatch) {
          res.push({ ...n, children: n.children ?? [] }); // 命中：保留整棵子树
        } else if (kids.length > 0) {
          res.push({ ...n, children: kids }); // 子孙命中：保留祖先路径
        }
      }
      return res;
    };
    return walk(treeData);
  }, [treeData, applied.nameKw, applied.codeKw]);

  /** 有关键词时自动全部展开，保证搜索结果可见 */
  const effectiveExpandedKeys =
    applied.nameKw.trim() || applied.codeKw.trim()
      ? collectExpandableIds(filteredTree)
      : expandedKeys;

  const doSearch = () => {
    const next = {
      miId: fMiId ?? 0,
      deptStatus: fStatus,
      nameKw: fName.trim(),
      codeKw: fCode.trim(),
    };
    setApplied(next);
    loadTree(next.miId, fStatus); // 机构/状态变了，展开重置
  };
  const doReset = () => {
    setFMiId(initialMiId ?? undefined);
    setFName('');
    setFCode('');
    setFStatus(undefined);
    setApplied({ miId: initialMiId ?? 0, nameKw: '', codeKw: '' });
    loadTree(initialMiId ?? 0, undefined);
  };

  /** 级联软删：确认文案明示会删除全部下级 */
  const removeDept = (r: DeptTreeNode) => {
    Modal.confirm({
      title: `删除部门「${r.deptName}」？`,
      content: '将同时删除其全部下级部门（级联删除），确定删除？',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await deleteDept(r.id);
          message.success(res?.message || '删除成功');
          loadTree(applied.miId, applied.deptStatus, true);
        } catch (e) {
          message.error((e as Error).message);
          throw e; // 保持弹窗打开
        }
      },
    });
  };

  /** 保存后刷新并保留展开状态；新建下级时自动展开父节点 */
  const reloadAfterSave = (expandId?: number) => {
    setFormOpen(false);
    setEditing(null);
    setCreateParent(null);
    if (expandId != null) {
      setExpandedKeys((prev) => Array.from(new Set([...prev, expandId])));
    }
    loadTree(applied.miId, applied.deptStatus, true);
  };

  const columns: ColumnsType<DeptTreeNode> = [
    { title: '部门名称', dataIndex: 'deptName' },
    {
      title: '部门编码',
      dataIndex: 'deptCode',
      width: 160,
      render: (_, r) => r.deptCode || '-',
    },
    {
      title: '状态',
      dataIndex: 'deptStatus',
      width: 90,
      align: 'center',
      render: (_, r) => renderDeptStatus(r.deptStatus),
    },
    {
      title: '操作',
      width: 240,
      render: (_, record) => (
        <Space size={4}>
          {record.deptLevel <= 2 && (
            <a
              onClick={() => {
                setEditing(null);
                setCreateParent(record);
                setFormOpen(true);
              }}
            >
              新增下级
            </a>
          )}
          <a
            onClick={() => {
              setEditing(record);
              setCreateParent(null);
              setFormOpen(true);
            }}
          >
            编辑
          </a>
          <a style={{ color: 'red' }} onClick={() => removeDept(record)}>
            删除
          </a>
          <a onClick={() => message.info('分配角色功能开发中')}>分配角色</a>
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
          padding: '12px 16px 4px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 筛选区：机构（动态）/ 名称 / 编码 / 状态 */}
        <div
          style={{ display: 'flex', gap: 8, marginBottom: 12, flexShrink: 0 }}
        >
          <MiParentSelect
            includeTop={false}
            style={{ width: 220 }}
            placeholder="所属机构"
            value={fMiId}
            onChange={(v) => setFMiId(v)}
          />
          <Input
            allowClear
            style={{ width: 170 }}
            placeholder="部门名称"
            value={fName}
            onChange={(e) => setFName(e.target.value)}
            onPressEnter={doSearch}
          />
          <Input
            allowClear
            style={{ width: 170 }}
            placeholder="部门编码"
            value={fCode}
            onChange={(e) => setFCode(e.target.value)}
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
          <Button type="primary" icon={<SearchOutlined />} onClick={doSearch}>
            查询
          </Button>
          <Button onClick={doReset}>重置</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              setEditing(null);
              setCreateParent(null);
              setFormOpen(true);
            }}
          >
            新建部门
          </Button>
        </div>

        {/* 列表头 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 10,
            flexShrink: 0,
          }}
        >
          <b style={{ fontSize: 15 }}>部门列表</b>
          <span style={{ color: '#8c8c8c', marginLeft: 12, fontSize: 13 }}>
            当前显示 {countNodes(filteredTree)} 个部门
          </span>
          <Space style={{ marginLeft: 'auto' }}>
            <Button
              size="small"
              onClick={() => setExpandedKeys(collectExpandableIds(treeData))}
            >
              展开全部
            </Button>
            <Button size="small" onClick={() => setExpandedKeys([])}>
              收起全部
            </Button>
          </Space>
        </div>

        <FillTable
          reservedHeight={160}
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={filteredTree}
          pagination={false}
          expandedRowKeys={effectiveExpandedKeys}
          onExpandedRowsChange={(keys: readonly React.Key[]) =>
            setExpandedKeys([...keys])
          }
          columns={columns}
        />
      </div>

      <DeptFormModal
        open={formOpen}
        editing={editing}
        parent={createParent}
        defaultMiId={applied.miId}
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
