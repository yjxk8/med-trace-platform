/**
 * 登录页(C1a 三分支版)
 * 基础链路沿用:body{account,pwd} 新契约 / Alert 透传 message / redirect 安全校验(拒绝 //)
 * ★2026-11-17 四分支:loginStatus=3(密码被管理员重置)→ /force-change-pwd 强制改密页(优先级最高,
 *   不走三分支/redirect);FORCE_PWD notice→标记后 /welcome 弹改密;type1→/org-select;其余→redirect||/welcome
 * ★ 登录 vo 全量存 initialState + permCtx 缓存(刷新恢复用,见 utils/permission.ts)
 * ★ orgId 写侧三分支全覆盖(2026-11-14):type1 由 /org-select 写入;type2 写 orgs[0];
 *   type3(普通用户)写 defaultOrgId ?? user.miId——与 getInitialState type3 分支同源同值
 */

import {
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { history, useModel } from '@umijs/max';
import { Alert, App, Button, Form, Input } from 'antd';
import { useEffect, useState } from 'react';
import { cacheUser, clearAuth, login as loginApi } from '@/services/auth';
import { LOGIN_STATUS } from '@/services/org/user';
import { setOrgId } from '@/utils/orgContext';
import {
  buildPermContext,
  FORCE_PWD_FLAG,
  savePermCache,
} from '@/utils/permission';

export default function Login() {
  const { message } = App.useApp();
  const { setInitialState } = useModel('@@initialState');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  // 进页清登录态(token/用户缓存/permCtx 缓存/机构上下文一并清,防残留 token 触发 401 循环)
  useEffect(() => {
    clearAuth();
    setInitialState({});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onFinish = async ({
    account,
    pwd,
  }: {
    account: string;
    pwd: string;
  }) => {
    setSubmitting(true);
    setErrMsg('');
    try {
      const vo = await loginApi(account, pwd); // 全量 LoginVO(auth.ts 已交付)
      localStorage.setItem('token', vo.token);
      cacheUser(vo.user);
      savePermCache(vo); // 刷新恢复用(注意:含权限快照,登出/401 必清)
      // 初始权限上下文(type1 未选机构前 orgId=null,由 /org-select 补全)
      const perm = buildPermContext(vo);
      setInitialState({
        token: vo.token,
        currentUser: vo.user,
        login: vo,
        perm,
      });

      // ── ★分支零:loginStatus=3(密码已被管理员重置)→ 强制改密页,不走三分支 ──
      // 改密接口仅需 token(拦截器已注入);orgId 未设置无影响(pwd-first 为用户级接口);
      // 用 replace 不留登录页历史栈;redirect 参数让位于强制改密
      if (String(vo.user?.loginStatus ?? '') === LOGIN_STATUS.RESET) {
        message.warning('密码已被管理员重置,请先设置新密码');
        history.replace('/force-change-pwd');
        return;
      }

      // ── 三分支 ──
      if (vo.notices?.some((n) => n.code === 'FORCE_PWD')) {
        sessionStorage.setItem(FORCE_PWD_FLAG, '1'); // GlobalNotices 消费,弹强制改密
      }
      if (vo.isAdmin && vo.adminType === 1) {
        history.replace('/org-select'); // C2:type1 必选机构,不带 redirect(orgId 由选择页写入)
        return;
      }
      if (vo.isAdmin && vo.adminType === 2) {
        // type2:orgs[0] 即全量上下文,顺手注入 X-Org-Id(后续请求审计归档)
        const mid = vo.orgs?.[0]?.org?.miId;
        if (mid) setOrgId(mid);
      }
      if (!vo.isAdmin) {
        // ★type3:后端已指定默认机构(defaultOrgId=user.miId),登录即写 orgId,
        // 消除「首次进 miId 页 fail-fast 黄条须刷新」的窗口期
        const orgId = Number(vo.defaultOrgId ?? vo.user?.miId ?? 0);
        if (orgId > 0) setOrgId(orgId);
      }
      const redirect = new URLSearchParams(window.location.search).get(
        'redirect',
      );
      history.replace(
        redirect?.startsWith('/') && !redirect.startsWith('//')
          ? redirect
          : '/welcome',
      );
    } catch (e) {
      setErrMsg((e as Error).message); // 含锁定文案「…请 X 分钟后再试」(B7:透传即终态)
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
      <div
        style={{
          width: 360,
          background: '#fff',
          padding: '32px 28px',
          borderRadius: 8,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <SafetyCertificateOutlined
            style={{ fontSize: 40, color: '#1677ff' }}
          />
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>
            麻精药品追溯管理平台
          </div>
        </div>
        {errMsg && (
          <Alert
            type="error"
            showIcon
            message={errMsg}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form onFinish={onFinish} size="large">
          <Form.Item
            name="account"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="账号"
              maxLength={64}
            />
          </Form.Item>
          <Form.Item
            name="pwd"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              maxLength={64}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            登 录
          </Button>
        </Form>
      </div>
    </div>
  );
}
