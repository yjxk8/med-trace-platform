/**
 * 强制改密页(loginStatus=3 首登)—— 2026-11-17
 * 重置密码后用户拿到 123456,下次登录必须先换掉临时密码才能进入系统。
 * 拦截链:登录页分流(loginStatus=3)→ 本页;刷新/直输 URL → app.tsx getInitialState 拦;
 * SPA 内导航 → layout.onPageChange 拦;本页 useEffect 守卫再兜一层(防 URL 直达绕过)。
 * 提交:changePwdFirst(免旧密码,身份由 token 识别)→ 成功 clearAuth 回登录页
 * (后端已置 loginStatus=2;用新密码重登,initialState 自然刷新,守卫不再拦)。
 * 注:auth.ts 无 setToken,清理统一走 clearAuth(token/用户缓存/dynamicRoutes/lastOrgId/orgId 全清)。
 */
import { LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { history, useModel } from '@umijs/max';
import { App, Button, Card, Form, Input, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { type CurrentUser, clearAuth } from '@/services/auth';
import { changePwdFirst, LOGIN_STATUS } from '@/services/org/user';

const { Title, Text } = Typography;

export default function ForceChangePwd() {
  const { message } = App.useApp();
  const { initialState, setInitialState } = useModel('@@initialState');
  const [submitting, setSubmitting] = useState(false);

  // 用户来源两路兜:登录后 initialState.currentUser / 刷新后 initialState.login.user
  // (getInitialState 只回 login 不回 currentUser,只读 currentUser 刷新后必空)
  const self = (initialState?.login?.user ??
    initialState?.currentUser ??
    undefined) as CurrentUser | undefined;

  // 守卫兜底:无 token → 回登录;已登录但非 loginStatus=3 → 回首页(防绕过 URL 直达)
  useEffect(() => {
    if (!localStorage.getItem('token')) {
      history.replace('/login');
      return;
    }
    if (self && String(self.loginStatus ?? '') !== LOGIN_STATUS.RESET) {
      history.replace('/');
    }
  }, [self]);

  const submit = async (v: { newPwd: string; confirm: string }) => {
    setSubmitting(true);
    try {
      const res = await changePwdFirst(v.newPwd);
      message.success(res?.message || '密码修改成功,请使用新密码重新登录');
      // 改密成功 → 后端 loginStatus 已置 2;
      // 前端最干净:clearAuth 全清(token/用户缓存/permCtx/dynamicRoutes/lastOrgId/orgId)回登录页,
      // 避免残留 loginStatus=3 的 initialState 被守卫再次拦截
      clearAuth();
      setInitialState({});
      history.replace('/login');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 400, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
        <Title level={4} style={{ marginBottom: 4 }}>
          <LockOutlined /> 设置新密码
        </Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          当前账号「{self?.name ?? ''}
          」的密码已被管理员重置为初始密码,请先设置您的新密码
        </Text>
        <Form layout="vertical" onFinish={submit}>
          <Form.Item
            name="newPwd"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '至少 6 位' },
              {
                validator: (_, value) =>
                  value === '123456'
                    ? Promise.reject('新密码不能与初始密码相同')
                    : Promise.resolve(),
              },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入新密码(至少 6 位)"
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认新密码"
            dependencies={['newPwd']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || getFieldValue('newPwd') === value
                    ? Promise.resolve()
                    : Promise.reject('两次输入的新密码不一致'),
              }),
            ]}
          >
            <Input.Password
              prefix={<SafetyOutlined />}
              placeholder="请再次输入新密码"
              autoComplete="new-password"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            确认修改
          </Button>
        </Form>
      </Card>
    </div>
  );
}
