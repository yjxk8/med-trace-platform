// src/app.tsx
import {
  BellOutlined,
  KeyOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max';
import { history } from '@umijs/max';
import { Avatar, Badge, Dropdown } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import ChangePasswordModal, {
  openChangePassword,
} from '@/components/ChangePasswordModal';
import GlobalBreadcrumb from '@/components/GlobalBreadcrumb';
import GlobalTabs, { TABS_STORAGE_KEY } from '@/components/GlobalTabs';
import type { CurrentUser } from '@/services/auth';
import {
  cacheUser,
  clearAuth,
  fetchCurrentUser,
  getCachedUser,
  handle401,
  logout as logoutApi,
} from '@/services/auth';
import { withIcons } from '@/utils/icon';

export interface InitialState {
  token?: string;
  currentUser?: CurrentUser;
}

const onLoginPage = () => history.location.pathname.startsWith('/login');

/**
 * 字段取值：后端确认用户名在 uName 字段。
 * 同时兼容用户信息被包在 user / data 一层里的响应结构。
 */
const pick = (u: any, ...keys: string[]): any => {
  if (!u) return undefined;
  for (const k of keys) {
    if (u[k]) return u[k];
    if (u.user?.[k]) return u.user[k];
    if (u.data?.[k]) return u.data[k];
  }
  return undefined;
};
const displayName = (u: any): string =>
  pick(u, 'uName', 'uAccount', 'userName', 'account', 'name') || '用户';
const displayRole = (u: any): string =>
  pick(u, 'uRole', 'roleName', 'role', 'roleNames') || '系统管理';

/** 登录页以外的未登录跳转：统一带 ?redirect=，登录成功后回跳 */
const gotoLoginWithRedirect = () => {
  const { pathname, search } = history.location;
  history.replace(`/login?redirect=${encodeURIComponent(pathname + search)}`);
};

/**
 * 启动时恢复登录态（对接文档 §四 行为变化后：
 * 不再依赖 /auth/me 返回 {user:null}，改为「本地 token + 用户缓存 + 401 统一跳转」）
 */
export async function getInitialState(): Promise<InitialState> {
  const token = localStorage.getItem('token') || undefined;
  if (!token) {
    if (!onLoginPage()) gotoLoginWithRedirect();
    return {};
  }
  // 登录页自身不做恢复（页面 useEffect 会清空 initialState）
  if (onLoginPage()) return {};

  const cached = getCachedUser();
  try {
    const currentUser = (await fetchCurrentUser(token)) ?? cached;
    cacheUser(currentUser);
    if (!currentUser) {
      clearAuth();
      history.replace('/login');
      return {};
    }
    return { token, currentUser };
  } catch {
    // 401 已由 unwrap → handle401 统一跳转；其余异常（如网络抖动）先用缓存撑住 UI
    return { token, currentUser: cached };
  }
}

/** 全局请求配置：带 token 请求头 + 401 兜底（与 services 层共用防抖的 handle401） */
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
      const bodyCode = error?.response?.data?.code;
      if (status === 401 || bodyCode === 401) handle401();
    },
  },
};

/* ───── 顶栏右侧：单行日期 ───── */
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

const HeaderDate: React.FC = () => {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span
      style={{ whiteSpace: 'nowrap', color: 'rgba(0,0,0,0.45)', fontSize: 14 }}
    >
      {now.format('YYYY年M月D日')} 星期{WEEK_CN[now.day()]}
    </span>
  );
};

/* ───── 完全自定义顶栏：面包屑居左，日期+铃铛+头像居右 ───── */
const GlobalHeader: React.FC<{ user: any }> = ({ user }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      height: 48,
      flexShrink: 0,
      padding: '0 24px',
      background: '#fff',
      borderBottom: '1px solid #f0f0f0',
    }}
  >
    <div style={{ flex: 1, minWidth: 0 }}>
      <GlobalBreadcrumb />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <HeaderDate />
      <Badge count={3} size="small">
        <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
      </Badge>
      <Dropdown
        menu={{
          items: [
            { key: 'changePwd', icon: <KeyOutlined />, label: '修改密码' },
            { type: 'divider' },
            { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' },
          ],
          onClick: ({ key }) => {
            if (key === 'changePwd') {
              openChangePassword();
            }
            if (key === 'logout') {
              // §5.2：无论后端成功或 401 都本地清理并跳登录（logout 内部已静默 401）
              const token = localStorage.getItem('token');
              if (token) logoutApi(token).catch(() => {});
              clearAuth();
              localStorage.removeItem(TABS_STORAGE_KEY);
              history.replace('/login');
            }
          },
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <Avatar
            size={30}
            style={{ backgroundColor: '#1677ff' }}
            icon={<UserOutlined />}
          />
          <span style={{ fontSize: 14 }}>{displayName(user)}</span>
        </div>
      </Dropdown>
    </div>
  </div>
);

/* ───── 分组节点拍平（无 path 的纯菜单分组，子项上提） ───── */
const flattenMenuGroups = (items: any[] = []): any[] =>
  (items ?? []).flatMap((it: any) => {
    const children = it.children ?? it.routes;
    if (!it.path && children?.length) return flattenMenuGroups(children);
    return [
      { ...it, children: children ? flattenMenuGroups(children) : undefined },
    ];
  });

export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  const user = (initialState as InitialState)?.currentUser as any;
  return {
    title: '毒麻精药品追溯管理平台',
    layout: 'side',
    fixSiderbar: true,
    fixedHeader: false,
    siderWidth: 216,
    menu: { locale: false },
    menuDataRender: (menuData) => withIcons(flattenMenuGroups(menuData ?? [])),
    menuRender: (_props, dom) => (onLoginPage() ? null : dom),
    headerRender: () => null,
    contentStyle: { padding: 0 },
    // 侧栏底部：用户卡片
    menuFooterRender: () => {
      if (onLoginPage() || !user) return null;
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderTop: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <Avatar
            size={34}
            style={{ backgroundColor: '#1677ff' }}
            icon={<UserOutlined />}
          />
          <div style={{ lineHeight: 1.3, overflow: 'hidden' }}>
            <div
              style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              {displayName(user)}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'rgba(0,0,0,0.45)',
                whiteSpace: 'nowrap',
              }}
            >
              {displayRole(user)}
            </div>
          </div>
        </div>
      );
    },
    onPageChange: () => {
      if (!user && !onLoginPage()) gotoLoginWithRedirect();
    },
    // 内容宿主：顶栏 + 页签条 + 页面；挂载全局修改密码弹窗
    childrenRender: (children) =>
      onLoginPage() ? (
        <>{children}</>
      ) : (
        <div
          style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <GlobalHeader user={user} />
          <GlobalTabs />
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 12,
            }}
          >
            {children}
          </div>
          <ChangePasswordModal />
        </div>
      ),
  };
};
