import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import {
  ModalForm,
  PageContainer,
  ProFormRadio,
  ProFormSelect,
  ProFormText,
} from '@ant-design/pro-components';
import {
  Button,
  Form,
  Input,
  message,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  TreeSelect,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import {
  createDept,
  type DeptTreeNode,
  deleteDept,
  getDeptTree,
  updateDept,
} from '@/services/dept';

/** 机构下拉（TODO: 接入机构列表接口后替换为动态数据） */
const MI_OPTIONS = [{ label: '华中科技大学同济医学院附属同济医院', value: 12 }];

/** 递归收集"有子节点"的所有 id（用于展开全部/自动展开） */
const collectExpandableIds = (nodes: DeptTreeNode[]): React.Key[] =>
  nodes.flatMap((n) =>
    n.children?.length ? [n.id, ...collectExpandableIds(n.children)] : [],
  );

/** 递归统计节点总数 */
const countNodes = (nodes: DeptTreeNode[]): number =>
  nodes.reduce((sum, n) => sum + 1 + countNodes(n.children ?? []), 0);

const DeptPage: React.FC = () => {
  const [form] = Form.useForm();

  // 服务端数据 & 已生效的筛选条件
  const [treeData, setTreeData] = useState<DeptTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState<{
    miId: number;
    deptStatus?: number;
    nameKw: string;
    codeKw: string;
  }>({ miId: 12, nameKw: '', codeKw: '' });

  // 表格展开控制
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  // 弹窗
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeptTreeNode | null>(null);

  /** 拉取部门树（机构/状态为服务端过滤） */
  const loadTree = async (miId: number, deptStatus?: number) => {
    setLoading(true);
    try {
      const data = await getDeptTree({ miId, deptStatus });
      setTreeData(data ?? []);
      // 默认展开第一层
      setExpandedKeys(
        (data ?? []).filter((n) => n.children?.length).map((n) => n.id),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTree(12, undefined);
  }, []);

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

  const parentOptions = useMemo(() => {
    const map = (
      nodes: DeptTreeNode[],
    ): { title: string; value: number; children: any[] }[] =>
      nodes.map((n) => ({
        title: n.deptName,
        value: n.id,
        children: map(n.children ?? []),
      }));
    return map(treeData);
  }, [treeData]);

  // ==================== 弹窗操作 ====================
  const openCreate = (parent?: DeptTreeNode) => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      miId: parent?.miId ?? applied.miId,
      deptStatus: 1,
      parentId: parent?.id,
    });
    setModalOpen(true);
  };

  const openEdit = (record: DeptTreeNode) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue({
      deptName: record.deptName,
      deptCode: record.deptCode,
      miId: record.miId,
      deptStatus: record.deptStatus,
      parentId: record.parentId === 0 ? undefined : record.parentId,
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    await deleteDept(id);
    message.success('删除成功');
    loadTree(applied.miId, applied.deptStatus);
  };

  return (
    <PageContainer title={false}>
      {/* ===== 筛选栏 ===== */}
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <Form
          form={form}
          layout="inline"
          initialValues={{ miId: 12 }}
          onFinish={async (v) => {
            setApplied({
              miId: v.miId,
              deptStatus: v.deptStatus,
              nameKw: v.deptName ?? '',
              codeKw: v.deptCode ?? '',
            });
            loadTree(v.miId, v.deptStatus);
          }}
        >
          <Form.Item name="miId" label="所属机构">
            <Select style={{ width: 240 }} options={MI_OPTIONS} />
          </Form.Item>
          <Form.Item name="deptName">
            <Input placeholder="部门名称" style={{ width: 160 }} allowClear />
          </Form.Item>
          <Form.Item name="deptCode">
            <Input placeholder="部门编码" style={{ width: 160 }} allowClear />
          </Form.Item>
          <Form.Item name="deptStatus">
            <Select
              placeholder="部门状态"
              style={{ width: 120 }}
              allowClear
              options={[
                { label: '启用', value: 1 },
                { label: '禁用', value: 2 },
              ]}
            />
          </Form.Item>
          <Button type="primary" icon={<SearchOutlined />} htmlType="submit">
            搜索
          </Button>
          <Button
            style={{ marginLeft: 12 }}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ miId: 12 });
              setApplied({ miId: 12, nameKw: '', codeKw: '' });
              loadTree(12, undefined);
            }}
          >
            重置
          </Button>
        </Form>
      </div>

      {/* ===== 部门列表卡片 ===== */}
      <div style={{ background: '#fff', borderRadius: 8, padding: 20 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}
        >
          <b style={{ fontSize: 16 }}>部门列表</b>
          <span style={{ color: '#8c8c8c', marginLeft: 12 }}>
            当前显示 {countNodes(filteredTree)} 个部门
          </span>
          <Space style={{ marginLeft: 'auto' }}>
            <Button
              onClick={() => setExpandedKeys(collectExpandableIds(treeData))}
            >
              展开全部
            </Button>
            <Button onClick={() => setExpandedKeys([])}>收起全部</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openCreate()}
            >
              新建
            </Button>
          </Space>
        </div>

        <Table<DeptTreeNode>
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={filteredTree}
          pagination={false}
          expandedRowKeys={effectiveExpandedKeys}
          onExpandedRowsChange={(keys) => setExpandedKeys([...keys])}
          columns={
            [
              { title: '部门名称', dataIndex: 'deptName' },
              { title: '部门编码', dataIndex: 'deptCode', width: 140 },
              {
                title: '状态',
                dataIndex: 'deptStatus',
                width: 90,
                render: (v: number) =>
                  v === 1 ? <Tag color="green">启用</Tag> : <Tag>禁用</Tag>,
              },
              {
                title: '操作',
                width: 230,
                render: (_, record) => (
                  <Space size={4}>
                    {record.deptLevel <= 2 && (
                      <a onClick={() => openCreate(record)}>新增</a>
                    )}
                    <a onClick={() => openEdit(record)}>编辑</a>
                    <Popconfirm
                      title="删除该部门？"
                      description="将同时删除其全部下级部门"
                      onConfirm={() => handleDelete(record.id)}
                    >
                      <a style={{ color: 'red' }}>删除</a>
                    </Popconfirm>
                    <a onClick={() => message.info('分配角色功能开发中')}>
                      分配角色
                    </a>
                  </Space>
                ),
              },
            ] as ColumnsType<DeptTreeNode>
          }
        />
      </div>

      {/* ===== 新建/编辑弹窗 ===== */}
      <ModalForm
        title={editing ? '编辑部门' : '新建部门'}
        width={520}
        open={modalOpen}
        onOpenChange={setModalOpen}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (values: any) => {
          const payload = {
            id: editing?.id,
            miId: values.miId,
            deptName: values.deptName,
            deptCode: values.deptCode,
            parentId: editing ? undefined : (values.parentId ?? 0),
            deptStatus: values.deptStatus,
          };
          if (editing) {
            await updateDept(payload);
            message.success('修改成功');
          } else {
            await createDept(payload);
            message.success('创建成功');
          }
          loadTree(applied.miId, applied.deptStatus);
          return true;
        }}
      >
        <ProFormText
          name="deptName"
          label="部门名称"
          rules={[{ required: true, message: '请输入部门名称' }]}
        />
        <ProFormText name="deptCode" label="部门编码" />
        <ProFormSelect
          name="miId"
          label="所属机构"
          options={MI_OPTIONS}
          disabled={!!editing}
          rules={[{ required: true, message: '请选择所属机构' }]}
        />
        <ProFormRadio.Group
          name="deptStatus"
          label="状态"
          options={[
            { label: '启用', value: 1 },
            { label: '禁用', value: 2 },
          ]}
        />
        <Form.Item name="parentId" label="上级部门">
          <TreeSelect
            treeData={parentOptions}
            placeholder="不选择则为顶级部门"
            allowClear
            treeDefaultExpandAll={false}
            disabled={!!editing}
          />
        </Form.Item>
      </ModalForm>
    </PageContainer>
  );
};

export default DeptPage;
