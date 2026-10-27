// src/app.tsx
import {
  BellOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max';
import { history, useLocation } from '@umijs/max';
import { Avatar, Badge, Button, Dropdown, Menu } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import dayjs from 'dayjs';
import { createElement, useEffect, useState } from 'react';
import ChangePasswordModal, {
  openChangePassword,
} from '@/components/ChangePasswordModal';
import GlobalBreadcrumb from '@/components/GlobalBreadcrumb';
import GlobalTabs, { TABS_STORAGE_KEY } from '@/components/GlobalTabs';
import type { RouteItem } from '@/config/routes';
import { routes } from '@/config/routes';
import type { CurrentUser } from '@/services/auth';
import {
  cacheUser,
  clearAuth,
  fetchCurrentUser,
  getCachedUser,
  handle401,
  logout as logoutApi,
} from '@/services/auth';
import { MENU_ICON_MAP } from '@/utils/icon';

export interface InitialState {
  token?: string;
  currentUser?: CurrentUser;
}

const onLoginPage = () => history.location.pathname.startsWith('/login');

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

const gotoLoginWithRedirect = () => {
  const { pathname, search } = history.location;
  history.replace(`/login?redirect=${encodeURIComponent(pathname + search)}`);
};

export async function getInitialState(): Promise<InitialState> {
  const token = localStorage.getItem('token') || undefined;

  // ① 无 token → 去登录页（带 redirect 回跳）
  if (!token) {
    if (!onLoginPage()) gotoLoginWithRedirect();
    return {};
  }
  // ② 已在登录页 → 不校验
  if (onLoginPage()) return {};

  // ③ 有 token → 向后端校验会话
  try {
    const currentUser = await fetchCurrentUser(token);
    if (!currentUser) {
      // ★ 变更 2026-10-14 二-6：后端对「用户已被物理删除」的残留 token 静默返回 null。
      //   必须与 401 同等处理：清登录态 + 跳登录。
      //   旧写法 `?? cached` 会用本地缓存把 null 盖掉 → 已删用户带死 token 继续用。
      clearAuth();
      gotoLoginWithRedirect(); // 带 ?redirect=，与 handle401 同口径
      return {};
    }
    cacheUser(currentUser);
    return { token, currentUser };
  } catch {
    // ④ 请求本身抛错（网络抖动/后端暂不可用；401 已由 errorConfig.errorHandler
    //    → handle401() 处理）：降级用本地缓存维持界面，不因网络问题踢人
    const cached = getCachedUser();
    if (cached) return { token, currentUser: cached };
    // 连缓存都没有 = 等效无登录态
    clearAuth();
    gotoLoginWithRedirect();
    return {};
  }
}

export const request: RequestConfig = {
  requestInterceptors: [
    (url: string, options: any) => {
      const token = localStorage.getItem('token');
      if (token) {
        // 后端契约：Authorization 为裸 token，无 Bearer 前缀（与 services/auth 的 bizRequest 一致）
        options.headers = { ...options.headers, Authorization: token };
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

/* ★ ───── 全局无滚动样式：一次性注入 ─────
 * 1) html/body/#root 高度 100% + overflow hidden → 浏览器级滚动条消失
 * 2) .no-scrollbar 工具类：隐藏滚动条但保留滚轮/触控板滚动能力
 */
const GlobalStyles: React.FC = () => (
  <style>{`
    html, body, #root { height: 100%; overflow: hidden; }
    .no-scrollbar {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .no-scrollbar::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
  `}</style>
);

/* ───── 侧栏折叠：模块级小 store ───── */
let siderCollapsed = false;
const siderListeners = new Set<() => void>();

const setSiderCollapsed = (v: boolean) => {
  siderCollapsed = v;
  siderListeners.forEach((l) => {
    l();
  });
};

const useSiderCollapsed = () => {
  const [v, setV] = useState(siderCollapsed);
  useEffect(() => {
    const l = () => setV(siderCollapsed);
    siderListeners.add(l);
    return () => void siderListeners.delete(l);
  }, []);
  return v;
};

const SIDER_WIDTH = 216;
const COLLAPSED_WIDTH = 56;

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

/* ───── 完全自定义顶栏 ───── */
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
              const token = localStorage.getItem('token');
              if (token) logoutApi().catch(() => {});
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

/* ───── 自绘侧栏菜单：数据来自 routes.ts ───── */
const iconOf = (name?: string) => {
  if (!name) return undefined;
  const Comp = MENU_ICON_MAP[name];
  return Comp ? createElement(Comp) : undefined;
};

const LEAF_GROUP_MAP: Record<string, string> = {};

const buildMenuItems = (list: RouteItem[]): ItemType[] =>
  list
    .filter((r) => r.name && r.path !== '/' && r.path !== '/login')
    .map((r) => {
      if (r.routes?.length) {
        const groupKey = r.menuPath ?? r.path ?? `group:${r.name}`;
        r.routes.forEach((leaf) => {
          if (leaf.path) LEAF_GROUP_MAP[leaf.path] = groupKey;
        });
        return {
          key: groupKey,
          icon: iconOf(r.icon),
          label: r.name,
          children: buildMenuItems(r.routes),
        };
      }
      return { key: r.path ?? '', icon: iconOf(r.icon), label: r.name };
    });

const SIDE_MENU_ITEMS = buildMenuItems(routes);

const SiderMenu: React.FC<{
  user: any;
  collapsed: boolean;
  onToggle: () => void;
  title?: React.ReactNode;
  logo?: React.ReactNode;
}> = ({ user, collapsed, onToggle, title, logo }) => {
  const location = useLocation();
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([
    location.pathname,
  ]);

  useEffect(() => {
    if (onLoginPage()) return;
    setSelectedKeys([location.pathname]);
    const gp = LEAF_GROUP_MAP[location.pathname];
    setOpenKeys(gp ? [gp] : []);
  }, [location.pathname]);

  const handleOpenChange = (keys: string[]) => {
    const latest = keys.find((k) => !openKeys.includes(k));
    setOpenKeys(latest ? [latest] : []);
  };

  const width = collapsed ? COLLAPSED_WIDTH : SIDER_WIDTH;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width,
        transition: 'width 0.2s',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderRight: '1px solid #f0f0f0',
        zIndex: 100,
        overflow: 'hidden',
      }}
    >
      {/* 顶部：logo + 名称 + 折叠按钮 */}
      {collapsed ? (
        <div
          style={{
            height: 56,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Button
            type="text"
            icon={<MenuUnfoldOutlined />}
            onClick={onToggle}
          />
        </div>
      ) : (
        <div
          onClick={() => history.push('/welcome')}
          style={{
            height: 56,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            padding: '0 8px 0 12px',
            overflow: 'hidden',
          }}
        >
          {typeof logo === 'string' ? (
            <img src={logo} alt="logo" style={{ width: 28, height: 28 }} />
          ) : (
            logo
          )}
          <span
            style={{
              flex: 1,
              minWidth: 0,
              color: 'rgba(0,0,0,0.88)',
              fontWeight: 600,
              fontSize: 15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title ?? '毒麻精药品追溯管理平台'}
          </span>
          <Button
            type="text"
            size="small"
            icon={<MenuFoldOutlined />}
            onClick={onToggle}
          />
        </div>
      )}

      {/* ★ 菜单：满屏铺满，超长时滚轮可滚但滚动条不可见 */}
      <Menu
        mode="inline"
        className="no-scrollbar"
        items={SIDE_MENU_ITEMS}
        selectedKeys={selectedKeys}
        openKeys={openKeys}
        onOpenChange={handleOpenChange}
        onClick={({ key }) => history.push(key)}
        inlineCollapsed={collapsed}
        style={{
          flex: 1,
          minHeight: 0,
          borderInlineEnd: 'none',
          overflowY: 'auto',
        }}
      />

      {/* 底部用户卡片 */}
      {user &&
        (collapsed ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '12px 0',
              flexShrink: 0,
              borderTop: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <Avatar
              size={34}
              style={{ backgroundColor: '#1677ff' }}
              icon={<UserOutlined />}
            />
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 16px',
              flexShrink: 0,
              borderTop: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <Avatar
              size={34}
              style={{ backgroundColor: '#1677ff', flexShrink: 0 }}
              icon={<UserOutlined />}
            />
            <div style={{ minWidth: 0, lineHeight: 1.3 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'rgba(0,0,0,0.88)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {displayName(user)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'rgba(0,0,0,0.45)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {displayRole(user)}
              </div>
            </div>
          </div>
        ))}
    </div>
  );
};

export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  const user = (initialState as InitialState)?.currentUser as any;
  const collapsed = useSiderCollapsed();
  const siderW = collapsed ? COLLAPSED_WIDTH : SIDER_WIDTH;

  return {
    title: '麻精药品追溯管理平台',
    layout: 'side',
    fixSiderbar: true,
    fixedHeader: false,
    siderWidth: siderW,
    menuRender: (props) =>
      onLoginPage() ? null : (
        <SiderMenu
          user={user}
          collapsed={collapsed}
          onToggle={() => setSiderCollapsed(!collapsed)}
          title={(props as any).title}
          logo={(props as any).logo}
        />
      ),
    headerRender: () => null,
    contentStyle: onLoginPage()
      ? { padding: 0 }
      : {
          padding: 0,
          marginLeft: siderW,
          width: `calc(100% - ${siderW}px)`,
          transition: 'margin-left 0.2s, width 0.2s',
        },
    onPageChange: () => {
      const hasToken = !!localStorage.getItem('token');
      if (!hasToken && !onLoginPage()) gotoLoginWithRedirect();
    },
    childrenRender: (children) =>
      onLoginPage() ? (
        <>
          <GlobalStyles />
          {children}
        </>
      ) : (
        <div
          style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* ★ 全局无滚动样式注入（body 满屏、no-scrollbar 工具类） */}
          <GlobalStyles />
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
