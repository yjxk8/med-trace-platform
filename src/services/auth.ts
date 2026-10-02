import { history, request } from '@umijs/max';

/** 当前用户（按 t_user 宽松声明，避免后端字段微调导致编译失败） */
export interface CurrentUser {
  uId?: number | string;
  uAccount?: string;
  uName?: string;
  uRole?: string;
  [key: string]: any;
}

/** 登录返回 LoginVO：裸对象，token 必有，用户信息字段位置后端可能调整 */
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
  // 跳转完成后释放，允许下一次真实过期再次触发
  setTimeout(() => {
    redirecting = false;
  }, 800);
}

/* ───── 响应处理（对齐后端对接文档 §四/§5.1） ─────
 * - 成功：HTTP 200 裸数据（无 {code,data} 包装）→ 直接透传
 * - 业务异常兜底：HTTP 200 + {code!=200, message} → 抛 Error(message)
 * - 拦截器 401：HTTP 401 + {code:401,message} → 清态 + 带 redirect 跳登录（防抖）
 * - 业务 500：HTTP 500 + {code:500,message} → 抛 Error(message)
 */
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

/* ───── 认证接口 ───── */

/** 登录：POST /auth/login body{uAccount,uPwd} → 裸 LoginVO（白名单接口，无需 token） */
export async function login(uAccount: string, uPwd: string): Promise<LoginResult> {
  const body = await unwrap<any>(
    request('/api/auth/login', { method: 'POST', data: { uAccount, uPwd } }),
  );
  const token = body?.token;
  if (!token) throw new Error('登录响应异常：未返回 token');
  // 用户信息字段位置防御性提取（user / userInfo / data.user）
  const user: CurrentUser | undefined =
    body?.user ?? body?.userInfo ?? body?.data?.user ?? undefined;
  return { token, user };
}

/**
 * 登出：POST /auth/logout?token=xxx
 * 对接文档 §5.2：无论成功或 401 都由调用方本地清理，这里静默吞掉所有错误，
 * 绝不触发 handle401（退出登录不需要 redirect 逻辑）
 */
export async function logout(token: string): Promise<void> {
  try {
    await request('/api/auth/logout', { method: 'POST', params: { token } });
  } catch {
    /* 静默：401/网络错误均忽略 */
  }
}

/**
 * 当前用户：GET /auth/me
 * token 走 Authorization 头（全局拦截器自动附加）；query 里再带一份兼容旧 service
 * 拦截器上线后：过期 token 直接 401（不再返回 {user:null}）
 */
export async function fetchCurrentUser(token?: string): Promise<CurrentUser | null> {
  const body = await unwrap<any>(
    request('/api/auth/me', { method: 'GET', params: token ? { token } : undefined }),
  );
  if (body?.user !== undefined) return body.user;
  // 兼容裸 user 对象
  if (body && (body.uId ?? body.uAccount)) return body as CurrentUser;
  return null;
}

/**
 * 修改密码：PUT /auth/password
 * 对接文档 §5.3 token 双发：header 一份（全局拦截器自动附加，给拦截器）+
 * body 一份（现有后端 service 从 body 取，历史约定）
 */
export async function changePassword(p: {
  token: string;
  oldPwd: string;
  newPwd: string;
}): Promise<void> {
  await unwrap(
    request('/api/auth/password', {
      method: 'PUT',
      data: { token: p.token, oldPwd: p.oldPwd, newPwd: p.newPwd },
    }),
  );
}
