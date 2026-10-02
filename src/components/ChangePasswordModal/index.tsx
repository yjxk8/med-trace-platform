import { history, useModel } from '@umijs/max';
import { Form, Input, Modal } from 'antd';
import { useEffect, useState } from 'react';
import { changePassword, clearAuth } from '@/services/auth';

/** 供任意处（如顶栏下拉菜单）调起弹窗 */
export const openChangePassword = () =>
  window.dispatchEvent(new Event('medtrace:open-change-pwd'));

interface PwdForm {
  oldPwd: string;
  newPwd: string;
  confirmPwd: string;
}

const EVENT = 'medtrace:open-change-pwd';

const ChangePasswordModal: React.FC = () => {
  const [form] = Form.useForm<PwdForm>();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setInitialState } = useModel('@@initialState');

  useEffect(() => {
    const handler = () => {
      setError('');
      setOpen(true);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const close = () => {
    form.resetFields();
    setError('');
    setOpen(false);
  };

  const handleOk = async () => {
    const { oldPwd, newPwd } = await form.validateFields();
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || '';
      await changePassword({ token, oldPwd, newPwd });
      close();
      // §5.3 成功后清 localStorage → 跳登录页（强制重登）
      clearAuth();
      await setInitialState({});
      history.replace('/login');
    } catch (e: any) {
      setError(e?.message || '修改失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="修改密码"
      open={open}
      onOk={handleOk}
      onCancel={close}
      confirmLoading={loading}
      okText="确认修改"
      cancelText="取消"
    >
      {error && (
        <div style={{ color: '#ff4d4f', marginBottom: 12 }}>{error}</div>
      )}
      <Form form={form} layout="vertical" autoComplete="new-password">
        <Form.Item
          name="oldPwd"
          label="原密码"
          rules={[{ required: true, message: '请输入原密码' }]}
        >
          <Input.Password placeholder="原密码" />
        </Form.Item>
        <Form.Item
          name="newPwd"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, max: 20, message: '新密码长度为 6-20 位' },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                value && value === getFieldValue('oldPwd')
                  ? Promise.reject(new Error('新密码不能与原密码相同'))
                  : Promise.resolve(),
            }),
          ]}
        >
          <Input.Password placeholder="6-20 位" maxLength={20} />
        </Form.Item>
        <Form.Item
          name="confirmPwd"
          label="确认新密码"
          dependencies={['newPwd']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                !value || value === getFieldValue('newPwd')
                  ? Promise.resolve()
                  : Promise.reject(new Error('两次输入的新密码不一致')),
            }),
          ]}
        >
          <Input.Password placeholder="再次输入新密码" maxLength={20} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ChangePasswordModal;
