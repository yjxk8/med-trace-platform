/**
 * 认证/请求基座 —— 契约：后端变更说明-用户管理-v3.md（终版）§二/§3.1
 * v3 变更：① 登录 body uAccount/uPwd → account/pwd；
 *         ② token 一律 Authorization 头（裸 token），query/body 传 token 全部废除（logout/me/password）；
 *         ③ CurrentUser 字段随 UserListVO 改为 id/account/name/type/miId...
 * 保留：401 防抖跳登录、裸类型透传 + {code,message} 兜底、用户本地缓存
 */
import { history, request } from '@umijs/max';

/** 当前用户（v3 新契约 key；[key: string]: any 容忍后端加字段） */
export interface CurrentUser {
  id?: number | string;
  account?: string;
  name?: string;
  type?: string | number;
  miId?: number | null;
  tenantType?: string | number;
  status?: string | number;
  loginStatus?: string | number;
  [key: string]: any;
}

/** 登录返回 LoginVO：裸对象 {token, user}（唯一免鉴权端点） */
export interface LoginResult {
  token: string;
  user?: CurrentUser;
}

const USER_CACHE_KEY = 'user';

/* ───── 本地登录态缓存（token + 用户信息） ───── */

export function cacheUser(u?: CurrentUser | null) {
  if (u) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
  else localStorage.removeItem(USER_CACHE_KEY);
}

export function getCachedUser(): CurrentUser | undefined {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : undefined;
  } catch {
    return undefined;
  }
}

export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem(USER_CACHE_KEY);
}

/* ───── 401 统一处理（防抖：并发请求同时 401 只跳一次） ───── */

let redirecting = false;

export function handle401() {
  if (redirecting) return;
  redirecting = true;
  clearAuth();
  const { pathname, search } = history.location;
  if (!pathname.startsWith('/login')) {
    history.replace(`/login?redirect=${encodeURIComponent(pathname + search)}`);
  }
  setTimeout(() => {
    redirecting = false;
  }, 800);
}

/* ───── 响应处理（v3 §二：成功裸类型直传；500 {code,message} 抛原文；401 清态跳登录） ───── */

async function unwrap<T>(p: Promise<any>): Promise<T> {
  let body: any;
  try {
    body = await p;
  } catch (e: any) {
    const status = Number(e?.response?.status ?? e?.status);
    if (status === 401 || e?.response?.data?.code === 401) {
      handle401();
      throw new Error('登录已过期，请重新登录');
    }
    const msg = e?.response?.data?.message || e?.message || '网络异常，请稍后重试';
    throw new Error(msg);
  }
  // 防御：个别接口可能仍以 HTTP 200 返回 {code,message} 包装
  if (body && typeof body === 'object' && 'code' in body && 'message' in body) {
    if (body.code === 200) return (body.data ?? body) as T;
    if (body.code === 401) {
      handle401();
      throw new Error(body.message || '登录已过期，请重新登录');
    }
    throw new Error(body.message || '请求失败');
  }
  return body as T;
}

/** 业务请求统一入口：成功裸数据直透，错误统一抛 Error（页面 catch 后展示） */
export async function bizRequest<T = any>(url: string, options?: any): Promise<T> {
  return unwrap<T>(request(url, options));
}

/* ───── 认证接口（v3 §3.1 终版） ───── */

/** 登录：POST /auth/login body{account,pwd}（v3 反转：uAccount/uPwd 作废）→ 裸 {token,user} */
export async function login(account: string, pwd: string): Promise<LoginResult> {
  const body = await unwrap<any>(
    request('/api/auth/login', { method: 'POST', data: { account, pwd } }),
  );
  const token = body?.token;
  if (!token) throw new Error('登录响应异常：未返回 token');
  const user: CurrentUser | undefined =
    body?.user ?? body?.userInfo ?? body?.data?.user ?? undefined;
  return { token, user };
}

/** 登出：POST /auth/logout（幂等）。v3 §二：token 仅走 Authorization 头（拦截器注入），不收任何参数 */
export async function logout(): Promise<void> {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } catch {
    /* 静默：401/网络错误均忽略；本地清理由调用方完成 */
  }
}

/**
 * 当前用户：GET /auth/me → {"user": UserListVO | null}
 * v3 §二：user=null = 未登录/过期/账号已删除 → 调用方按 401 同等处理（清 token 跳登录）
 * token 通道：入参显式带（登录页 localStorage 尚未落 token 的兜底场景）或全局拦截器注入，均走头
 */
export async function fetchCurrentUser(token?: string): Promise<CurrentUser | null> {
  const body = await unwrap<any>(
    request('/api/auth/me', {
      method: 'GET',
      ...(token ? { headers: { Authorization: token } } : {}),
    }),
  );
  if (body?.user !== undefined) return body.user; // {"user":null} → null（含已删用户）
  if (body && (body.id ?? body.account)) return body as CurrentUser; // 兼容裸 user 对象
  return null;
}

/** 修改密码：PUT /auth/password body{oldPwd,newPwd}（newPwd ≥6）；token 仅走 Authorization 头 */
export async function changePassword(p: { oldPwd: string; newPwd: string }): Promise<void> {
  await unwrap(
    request('/api/auth/password', {
      method: 'PUT',
      data: { oldPwd: p.oldPwd, newPwd: p.newPwd },
    }),
  );
}
