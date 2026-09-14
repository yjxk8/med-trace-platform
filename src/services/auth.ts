import { history, request } from '@umijs/max';

/** 当前用户（/auth/me 返回的 user 对象，按 t_user 宽松声明，避免后端字段微调导致编译失败） */
export interface CurrentUser {
  uId?: number | string;
  uAccount?: string;
  uName?: string;
  [key: string]: any;
}

/** 登录返回：POST /auth/login → {token,user} */
export interface LoginResult {
  token: string;
  user: CurrentUser;
}

/**
 * 统一解包后端响应：
 * - 若返回统一包装 { code, message, data }：code===200/0 时取 data，否则抛 message
 *   （与待办"全局异常处理器"格式 {"code":500,"message":"..."} 对齐）
 * - 若直接返回业务数据：原样透传
 * - HTTP 401：清 token + 踢回登录页（为待办"token 校验拦截器"预留）
 */
async function unwrap<T>(p: Promise<any>): Promise<T> {
  let body: any;
  try {
    body = await p;
  } catch (e: any) {
    const status = Number(e?.response?.status ?? e?.status);
    if (status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') history.replace('/login');
      throw new Error('登录已过期，请重新登录');
    }
    // 优先透出后端 message（全局异常处理器上线后自动生效）
    const backendMsg = e?.response?.data?.message ?? e?.data?.message;
    throw new Error(backendMsg || e?.message || '网络异常，请稍后重试');
  }
  if (body && typeof body === 'object' && 'code' in body) {
    if (body.code === 200 || body.code === 0) return body.data as T;
    throw new Error(body.message || '请求失败');
  }
  return body as T;
}

/** 登录：POST /auth/login body{uAccount,uPwd} */
export async function login(uAccount: string, uPwd: string): Promise<LoginResult> {
  try {
    return await unwrap<LoginResult>(
      request('/api/auth/login', { method: 'POST', data: { uAccount, uPwd } }),
    );
  } catch (e: any) {
    // 待办2(全局异常处理器)上线前，登录失败 500 时拿不到 message，这里统一兜底文案
    throw new Error(
      e?.response?.data?.message || '登录失败：账号或密码错误，或后端服务未启动',
    );
  }
}

/** 登出：POST /auth/logout?token= */
export async function logout(token: string): Promise<void> {
  await unwrap(request('/api/auth/logout', { method: 'POST', params: { token } }));
}

/** 获取当前用户：GET /auth/me?token= */
export async function fetchCurrentUser(token: string): Promise<CurrentUser> {
  return unwrap<CurrentUser>(
    request('/api/auth/me', { method: 'GET', params: { token } }),
  );
}

/** 修改密码：PUT /auth/password body{token,oldPwd,newPwd}（后续"修改密码弹窗"直接用） */
export async function changePassword(params: {
  token: string;
  oldPwd: string;
  newPwd: string;
}): Promise<void> {
  await unwrap(request('/api/auth/password', { method: 'PUT', data: params }));
}
