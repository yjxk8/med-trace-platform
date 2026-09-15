import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max';
import { history } from '@umijs/max';
import type { CurrentUser } from '@/services/auth';
import { fetchCurrentUser, logout as logoutApi } from '@/services/auth';

/** 全局初始状态：替代原先写死的"测试用户" */
export interface InitialState {
  token?: string;
  currentUser?: CurrentUser;
}

/**
 * 应用启动时执行：
 * 1. 有 token → 调 /auth/me 换取当前用户（成功恢复登录态；失败清 token 回登录页）
 * 2. 无 token → 未在登录页则跳 /login
 */
export async function getInitialState(): Promise<InitialState> {
  const token = localStorage.getItem('token') || undefined;
  const onLoginPage = history.location.pathname.startsWith('/login');

  if (!token) {
    if (!onLoginPage) history.replace('/login');
    return {};
  }

  try {
    const currentUser = await fetchCurrentUser(token); // 现在返回 user 或 null
    if (!currentUser) {
      // token 存在但已失效（后端重启内存 token 清空就是这种场景）
      localStorage.removeItem('token');
      if (!onLoginPage) history.replace('/login');
      return {};
    }
    return { token, currentUser };
  } catch (e) {
    localStorage.removeItem('token');
    if (!onLoginPage) history.replace('/login');
    return {};
  }
}

/** ProLayout 运行时配置：路由守卫 + 右上角退出登录 */
export const layout: RunTimeLayoutConfig = ({ initialState }) => ({
  title: '毒麻精药品追溯管理平台',
  onPageChange: () => {
    // 路由守卫：未登录访问业务页 → 踢回登录页
    const { currentUser } = initialState ?? {};
    if (!currentUser && !history.location.pathname.startsWith('/login')) {
      history.replace('/login');
    }
  },
  logout: () => {
    const token = localStorage.getItem('token');
    if (token) logoutApi(token).catch(() => {}); // best-effort，登出失败不阻塞前端
    localStorage.removeItem('token');
    history.replace('/login');
  },
  avatarProps: {
    title:
      initialState?.currentUser?.uName ||
      initialState?.currentUser?.uAccount ||
      '未登录',
  },
});

/**
 * 全局请求配置：
 * - requestInterceptors：所有请求统一注入 Authorization: Bearer <token>
 *   （后端 token 校验拦截器上线后直接从该 header 取值即可；
 *     /auth/me、/auth/logout现阶段仍按后端现有契约同时携带 ?token= query，互不冲突）
 * - errorConfig.errorHandler：HTTP 401 统一踢回登录页（umi 内部处理后错误仍会抛给业务层）
 */
export const request: RequestConfig = {
  requestInterceptors: [
    (url: string, options: any) => {
      const token = localStorage.getItem('token');
      if (token) {
        options.headers = {
          ...options.headers,
          Authorization: `Bearer ${token}`,
        };
      }
      return { url, options };
    },
  ],
  errorConfig: {
    errorHandler: (error: any) => {
      const status = Number(error?.response?.status ?? error?.status);
      if (status === 401) {
        localStorage.removeItem('token');
        if (window.location.pathname !== '/login') history.replace('/login');
      }
    },
  },
};
