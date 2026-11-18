// src/components/ForcePwdModal.tsx —— 挂在登录后根布局(建议 org-select 与 authenticated 布局外层各挂一份或统一在全局壳)

import { history, useModel } from '@umijs/max';
import { App, Form, Input, Modal } from 'antd';
import { changePassword, clearAuth } from '@/services/auth';

export default function ForcePwdModal() {
  const { message } = App.useApp();
  const { initialState } = useModel('@@initialState');
  const login = (initialState as any)?.login;
  // §5:弹框条件 = notices 含 FORCE_PWD 或 user.loginStatus===1(首登一次,改密后标志清)
  const open =
    !!login &&
    ((login.notices ?? []).some((n: any) => n.code === 'FORCE_PWD') ||
      login.user?.loginStatus === 1);
  const [form] = Form.useForm();

  return (
    <Modal
      title="修改初始密码"
      open={open}
      closable={false}
      maskClosable={false}
      onOk={async () => {
        const v = await form.validateFields();
        try {
          await changePassword({ oldPwd: v.oldPwd, newPwd: v.newPwd }); // PUT /auth/password,§3:≥6位
          message.success('密码修改成功，请重新登录'); // §3:成功即踢全部会话 → 引导重登(§12-3 设计行为)
          clearAuth();
          history.replace('/login');
        } catch (e: any) {
          message.error(e.message);
        } // 文案直渲染:原密码不能为空/长度不足/原密码错误
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="oldPwd"
          label="原密码"
          rules={[{ required: true, message: '原密码不能为空' }]}
        >
          <Input.Password />
        </Form.Item>
        <Form.Item
          name="newPwd"
          label="新密码"
          rules={[
            { required: true, min: 6, message: '新密码长度不能少于 6 位' },
          ]}
        >
          <Input.Password />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="确认新密码"
          dependencies={['newPwd']}
          rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator: (_, v) =>
                v === getFieldValue('newPwd')
                  ? Promise.resolve()
                  : Promise.reject(new Error('两次输入不一致')),
            }),
          ]}
        >
          <Input.Password />
        </Form.Item>
      </Form>
    </Modal>
  );
}
