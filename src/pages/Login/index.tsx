import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { history, useModel } from '@umijs/max';
import { Alert, Button, Card, Form, Input } from 'antd';
import { useEffect, useState } from 'react';
import { login } from '@/services/auth';

interface LoginParams {
  uAccount: string;
  uPwd: string;
}

const LoginPage: React.FC = () => {
  const [form] = Form.useForm<LoginParams>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 登录成功后写入全局 initialState（替代原先写死的"测试用户"）
  const { setInitialState } = useModel('@@initialState');

  // 进入登录页即清空残留登录态（如退出登录后遗留在 initialState 里的旧用户）
  useEffect(() => {
    setInitialState({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFinish = async (values: LoginParams) => {
    setLoading(true);
    setError('');
    try {
      const { token, user } = await login(values.uAccount.trim(), values.uPwd);
      localStorage.setItem('token', token);
      await setInitialState({ token, currentUser: user });
      history.push('/drug-transfer'); // 登录后默认进入药库出入库页
    } catch (e: any) {
      setError(e?.message || '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'linear-gradient(135deg, #0b2545 0%, #14549c 55%, #12939a 100%)',
        padding: 24,
      }}
    >
      <Card
        style={{
          width: 400,
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
        }}
        styles={{ body: { padding: '40px 36px 28px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{ fontSize: 22, fontWeight: 600, color: 'rgba(0,0,0,0.88)' }}
          >
            毒麻精药品追溯管理平台
          </div>
          <div
            style={{ marginTop: 8, fontSize: 13, color: 'rgba(0,0,0,0.45)' }}
          >
            同济医院 · 账号登录
          </div>
        </div>

        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginBottom: 20 }}
          />
        )}

        <Form form={form} onFinish={handleFinish} autoComplete="off">
          <Form.Item
            name="uAccount"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input
              size="large"
              prefix={<UserOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />}
              placeholder="账号"
              autoComplete="username"
            />
          </Form.Item>
          <Form.Item
            name="uPwd"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />}
              placeholder="密码"
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8, marginTop: 4 }}>
            <Button
              type="primary"
              size="large"
              block
              htmlType="submit"
              loading={loading}
            >
              登 录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default LoginPage;
