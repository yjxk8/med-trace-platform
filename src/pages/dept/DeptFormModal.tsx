/**
 * 部门 新增/编辑弹窗 —— 契约：services/dept.ts
 * 本轮优化（对齐 Role/Menu 弹窗交互）：
 *  ① 修复：validateFields 拒绝无 catch → 校验失败自动聚焦第一个错误字段；
 *  ② 修复：提交失败（bizRequest reject）无提示 → toast 透传 + 确认按钮可重试
 *    （onOk promise reject，antd 保持弹窗开启）；
 *  ③ 提交 loading + disabled 双防重复；okText 模式区分「创建/保存」；
 *  ④ 有改动关闭弹「未保存确认」（savedRef 防保存成功后误弹）。
 * 保留：miId 契约必传 / 编辑不允许改上级与机构（不进 payload）/ 三级限制 selectable /
 *      父级下拉数据源 = 页面已加载树（不重复请求）/ 新建下级后自动展开父节点
 */
import { App, Col, Form, Input, Modal, Row, Select, TreeSelect } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
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

/** validateFields 拒绝结构（局部最小类型，避免 any） */
type FormValidateError = { errorFields?: { name?: unknown }[] };

/** 表单值（部门字段均为标量，直接用 SaveParams 子集） */
type DeptFormValues = {
  deptName: string;
  deptCode?: string;
  miId: number;
  deptStatus: number;
  parentId?: number;
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
  const savedRef = useRef(false); // 优化：保存成功后关闭不弹「未保存确认」
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
    savedRef.current = false; // 优化：每次打开重置保存标记
    form.resetFields();
    if (isEdit && editing) {
      form.setFieldsValue({
        deptName: editing.deptName,
        deptCode: editing.deptCode,
        miId: editing.miId,
        deptStatus: Number(editing.deptStatus) === 2 ? 2 : 1, // tinyint 数字归一化
      });
    } else {
      form.setFieldsValue({
        miId: parent?.miId ?? defaultMiId,
        deptStatus: 1,
        parentId: parent?.id,
      });
    }
  }, [open, editing, parent]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 优化：未保存确认——有改动弹确认，无改动直接关闭 */
  const handleClose = () => {
    if (savedRef.current || !form.isFieldsTouched()) {
      onClose();
      return;
    }
    Modal.confirm({
      title: '未保存的修改',
      content: '当前弹窗有未保存的修改，关闭后将丢失，确定关闭？',
      okText: '丢弃并关闭',
      okButtonProps: { danger: true },
      cancelText: '继续编辑',
      onOk: onClose,
    });
  };

  const submit = async () => {
    let v: DeptFormValues;
    try {
      v = await form.validateFields();
    } catch (err) {
      // 修复：校验失败自动聚焦第一个错误字段（原拒绝后静默）
      const e = err as FormValidateError;
      const names = e.errorFields?.[0]?.name as (string | number)[] | undefined;
      const first = names?.[0];
      if (first != null) {
        form.scrollToField(first);
        form.focusField?.(first);
      }
      return;
    }
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
        savedRef.current = true;
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
        savedRef.current = true;
        onSaved?.(v.parentId ?? undefined); // 新建下级后自动展开父节点
      }
    } catch (e) {
      // 修复：提交失败透传且弹窗不关闭（原 reject 冒泡但无提示）
      message.error((e as Error).message);
      throw e; // antd 捕获 → 弹窗保持开启，可修正后重试
    } finally {
      setSaving(false);
    }
  };

  return (
    // 优化：okText 区分 / confirmLoading + okButtonProps 双防重复 / onCancel 未保存确认
    <DraggableModal
      title={isEdit ? '编辑部门' : '新建部门'}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      okButtonProps={{ disabled: saving }}
      okText={isEdit ? '保存' : '创建'}
      onCancel={handleClose}
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
