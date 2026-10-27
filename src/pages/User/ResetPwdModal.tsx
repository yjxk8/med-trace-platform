/**
 * 重置密码弹窗（v3 §3.2 reset-password）
 * - 新密码选填：填了（≥6 位）按输入值重置；留空 → body 整体不传，后端重置为 123456
 * - 成功提示直接展示固定值口径，绝不写「新密码已发送」
 * - 重置后 loginStatus=3 → 列表「登录状态」变橙标「密码已重置」
 */
import { App, Form, Input } from 'antd';
import { useEffect, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import { resetUserPassword, type UserVO } from '@/services/org/user';

interface Props {
  open: boolean;
  target: UserVO | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ResetPwdModal({
  open,
  target,
  onClose,
  onSaved,
}: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) form.resetFields();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const v = await form.validateFields();
    if (!target) return;
    setSaving(true);
    try {
      await resetUserPassword(target.id, v.newPwd || undefined); // 留空 → body 整体不传
      message.success(v.newPwd ? '密码已重置' : '密码已重置，新密码为 123456');
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <DraggableModal
      title={`重置密码${target ? ` · ${target.name}` : ''}`}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnClose
      width={380}
      okText="重置"
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item
          name="newPwd"
          label="新密码"
          rules={[{ min: 6, message: '至少 6 位；留空则重置为 123456' }]}
          extra={
            <span style={{ fontSize: 12 }}>
              留空 → 重置为固定密码 123456，该用户下次登录将被引导修改密码
            </span>
          }
        >
          <Input.Password
            placeholder="留空重置为 123456"
            autoComplete="new-password"
          />
        </Form.Item>
      </Form>
    </DraggableModal>
  );
}
