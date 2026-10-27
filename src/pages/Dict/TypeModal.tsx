/**
 * 字典类型 新增/编辑弹窗
 * 红线：编辑时 dictCode/所属分组 后端锁定（传了也被忽略）→ disabled；
 *      编辑态状态变更走独立接口 setDictTypeStatus（PUT /type 锁定 status）
 */
import { App, Form, Input, Radio, Switch } from 'antd';
import { useEffect, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import {
  createDictType,
  type DictTypeVO,
  setDictTypeStatus,
  updateDictType,
} from '@/services/dict';
import { SCOPE_META } from './constants';
import { isOn } from './shared';

interface Props {
  open: boolean;
  editing: DictTypeVO | null; // null = 新增
  onClose: () => void;
  /** 新增成功回传新 id，用于自动选中新类型 */
  onSaved: (newId?: number) => void;
}

export default function TypeModal({ open, editing, onClose, onSaved }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [statusOn, setStatusOn] = useState(true);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(editing ?? { type: '2' }); // 新增默认「院内」
    setStatusOn(editing ? isOn(editing.status) : true);
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        // PUT 仅提交 dictName/remark（后端锁定其余字段）
        await updateDictType({
          id: editing.id,
          dictName: v.dictName,
          remark: v.remark,
        });
        const next = statusOn ? 0 : 1;
        if (next !== (isOn(editing.status) ? 0 : 1)) {
          await setDictTypeStatus(editing.id, next as 0 | 1);
        }
        onSaved();
      } else {
        const res = await createDictType({
          dictCode: v.dictCode,
          dictName: v.dictName,
          type: v.type,
          remark: v.remark,
        });
        onSaved(res?.id);
      }
      message.success(editing ? '修改成功' : '创建成功');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DraggableModal
      title={editing ? '编辑字典类型' : '新增字典类型'}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnClose
      width={480}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="dictCode"
          label="字典代码"
          rules={[{ required: true, message: '请输入字典代码' }]}
        >
          <Input disabled={!!editing} placeholder="如 YN0.2.17" />
        </Form.Item>
        <Form.Item
          name="dictName"
          label="字典名称"
          rules={[{ required: true, message: '请输入字典名称' }]}
        >
          <Input placeholder="如 药品出库类型" />
        </Form.Item>
        <Form.Item
          name="type"
          label="所属分组"
          rules={[{ required: true, message: '请选择所属分组' }]}
        >
          {/* 国标/行标 type 枚举【待后端确认】，确认后选项自然生效 */}
          <Radio.Group
            disabled={!!editing}
            options={SCOPE_META.map((s) => ({
              value: s.value,
              label: s.label,
            }))}
          />
        </Form.Item>
        {editing && (
          <Form.Item label="状态">
            <Switch
              checked={statusOn}
              checkedChildren="启用"
              unCheckedChildren="停用"
              onChange={setStatusOn}
            />
          </Form.Item>
        )}
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} placeholder="选填" />
        </Form.Item>
      </Form>
    </DraggableModal>
  );
}
