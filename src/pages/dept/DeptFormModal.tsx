/**
 * 部门 新增/编辑弹窗 —— 契约：services/dept.ts
 * - 新增：parentId 不选=顶级（提交 0）；最多三级——父级下拉仅一/二级节点可选（selectable）
 * - 编辑：所属机构/上级部门禁用展示且不进 payload（服务端约束「不允许改上级部门」）
 * - 父级下拉数据源 = 页面已加载树（treeData props），不重复请求
 */
import { App, Col, Form, Input, Row, Select, TreeSelect } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import MiParentSelect from '@/components/MiParentSelect';
import { createDept, type DeptTreeNode, updateDept } from '@/services/org/dept';
import { DEPT_STATUS_OPTIONS } from './shared';

interface Props {
  open: boolean;
  editing: DeptTreeNode | null; // null = 新增
  parent: DeptTreeNode | null; // 「新增下级」时的预选父级
  defaultMiId: number; // 新建默认机构（当前筛选机构）
  treeData: DeptTreeNode[]; // 上级下拉数据源
  onClose: () => void;
  onSaved: (expandId?: number) => void;
}

type ParentOption = {
  title: string;
  value: number;
  selectable: boolean;
  children?: ParentOption[];
};

const itemMb = { marginBottom: 10 } as const;
const C2 = { span: 12 } as const;

export default function DeptFormModal({
  open,
  editing,
  parent,
  defaultMiId,
  treeData,
  onClose,
  onSaved,
}: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing?.id;

  const parentOptions = useMemo<ParentOption[]>(() => {
    const map = (nodes: DeptTreeNode[]): ParentOption[] =>
      nodes.map((n) => ({
        title: n.deptName,
        value: n.id,
        selectable: n.deptLevel <= 2, // 三级限制：只能挂到一/二级下
        children: n.children?.length ? map(n.children) : undefined,
      }));
    return map(treeData);
  }, [treeData]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (isEdit && editing) {
      form.setFieldsValue({
        deptName: editing.deptName,
        deptCode: editing.deptCode,
        miId: editing.miId,
        deptStatus: Number(editing.deptStatus) === 2 ? 2 : 1,
      });
    } else {
      form.setFieldsValue({
        miId: parent?.miId ?? defaultMiId,
        deptStatus: 1,
        parentId: parent?.id,
      });
    }
  }, [open, editing, parent]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      if (isEdit && editing) {
        // 编辑不允许改上级部门/机构：parentId 不提交、miId 传原值
        const res = await updateDept({
          id: editing.id,
          miId: editing.miId,
          deptName: v.deptName,
          deptCode: v.deptCode,
          deptStatus: v.deptStatus,
        });
        message.success(res?.message || '修改成功');
        onSaved?.();
      } else {
        const res = await createDept({
          miId: v.miId,
          deptName: v.deptName,
          deptCode: v.deptCode,
          parentId: v.parentId ?? 0, // 不选=顶级
          deptStatus: v.deptStatus,
        });
        message.success(res?.message || '创建成功');
        onSaved?.(v.parentId ?? undefined); // 新建下级后自动展开父节点
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <DraggableModal
      title={isEdit ? '编辑部门' : '新建部门'}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnClose
      width={640}
      centered
    >
      <Form form={form} layout="vertical">
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item
              name="deptName"
              label="部门名称"
              rules={[{ required: true, message: '部门名称不能为空' }]}
              style={itemMb}
            >
              <Input placeholder="必填" maxLength={50} />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item
              name="deptCode"
              label="部门编码"
              style={itemMb}
              extra={
                <span style={{ fontSize: 12 }}>
                  药房等业务模块按编码引用，建议规范命名
                </span>
              }
            >
              <Input placeholder="选填" maxLength={50} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item
              name="miId"
              label="所属机构"
              rules={[{ required: true, message: '请选择所属机构' }]}
              style={itemMb}
            >
              <MiParentSelect
                includeTop={false}
                disabled={isEdit}
                placeholder="选择机构"
              />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="deptStatus" label="状态" style={itemMb}>
              <Select options={DEPT_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>

        {isEdit ? (
          // 编辑：不允许改上级——只读展示
          <Form.Item label="上级部门" style={itemMb}>
            {editing && Number(editing.parentId) === 0 ? (
              <span>顶级部门</span>
            ) : (
              <TreeSelect
                value={editing?.parentId}
                treeData={parentOptions}
                disabled
              />
            )}
          </Form.Item>
        ) : (
          <Form.Item
            name="parentId"
            label="上级部门"
            style={itemMb}
            extra={
              <span style={{ fontSize: 12 }}>
                不选择则为顶级部门；最多三级（仅一/二级下可挂）
              </span>
            }
          >
            <TreeSelect
              treeData={parentOptions}
              allowClear
              placeholder="不选择则为顶级部门"
            />
          </Form.Item>
        )}

        {isEdit && (
          <div style={{ color: '#999', fontSize: 12 }}>
            所属机构与上级部门不可修改；删除部门将级联删除其全部下级
          </div>
        )}
      </Form>
    </DraggableModal>
  );
}
