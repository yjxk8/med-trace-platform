import {
  BellOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { IRoute, RequestConfig, RunTimeLayoutConfig } from '@umijs/max';
import { history, useLocation } from '@umijs/max';
import { Avatar, Badge, Button, Dropdown, Menu } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import dayjs from 'dayjs';
import { createElement, lazy, Suspense, useEffect, useState } from 'react';
import ChangePasswordModal, {
  openChangePassword,
} from '@/components/ChangePasswordModal';
import GlobalBreadcrumb from '@/components/GlobalBreadcrumb';
import GlobalNotices from '@/components/GlobalNotices';
import GlobalTabs, { TABS_STORAGE_KEY } from '@/components/GlobalTabs';
import OrgSwitcher from '@/components/OrgSwitcher';
import type { RouteItem } from '@/config/routes';
import { routes } from '@/config/routes';
// ★⑨渲染级改密闸门:静态导入打进主包,零 chunk 依赖(改密页白屏不可能发生);
// ⚠️ 路径大小写必须与真实目录一致(见文末说明),与 routes.ts 的 ./User/ForceChangePwd 同源
import ForceChangePwd from '@/pages/User/ForceChangePwd';
import type { CurrentUser, LoginResult, MenuVO } from '@/services/auth';
import {
  clearAuth,
  fetchMe,
  handle401,
  logout as logoutApi,
} from '@/services/auth';
import { LOGIN_STATUS } from '@/services/org/user'; // ★⑦⑧⑨强制改密判定
import { iconOf } from '@/utils/icon';
import { getOrgId, setOrgId } from '@/utils/orgContext';
import {
  buildPermContext,
  computeMenuPath,
  type PermContext,
  readDynRoutes,
  saveDynRoutes,
} from '@/utils/permission';

/* ───── 动态路由组件解析 ───── */
// ★映射表只能写【真实存在】的目录——esbuild 启动期静态解析全部 import,路径不存在直接构建失败;
// 后端 component 值查不到映射时统一落 Placeholder 占位页,不会白屏(T4 建页后再加回映射)
const COMPONENT_MAP: Record<string, any> = {
  DrugInfos: () => import('@/pages/DrugInfos'),
  DrugTransfer: () => import('@/pages/DrugTransfer'),
  Dept: () => import('@/pages/dept'), // 实际目录为小写 dept(对齐,防 Linux 构建炸)
  Menu: () => import('@/pages/Menu'),
  Dict: () => import('@/pages/Dict'),
  Mi: () => import('@/pages/Mi'),
  MiConfig: () => import('@/pages/MiConfig'),
  drugStock: () => import('@/pages/drugStock'), // 后端菜单 component:"drugStock"(库存查询)
  Role: () => import('@/pages/Role'),
  User: () => import('@/pages/User'),
  Placeholder: () => import('@/pages/Placeholder'),
};

/** 遗留菜单 component 为旧 Vue 工程路径 → 映射本项目对应页;未映射的落 Placeholder */
const LEGACY_COMPONENT_MAP: Record<string, any> = {
  '/system/menu/index.vue': () => import('@/pages/Menu'),
  '/sysytemFolder/deptManagement/deptManagement.vue': () =>
    import('@/pages/dept'),
  '/sysytemFolder/tenantManage/tenantManage.vue': () => import('@/pages/Mi'),
  '/MasterData/MasterData.vue': () => import('@/pages/Dict'),
};

const resolveComponent = (name?: string | null) => {
  if (name && /placeholder/i.test(name))
    return () => import('@/pages/Placeholder'); // 201003 "UserGroup/placeholder" 等
  return (
    (name && (COMPONENT_MAP[name] ?? LEGACY_COMPONENT_MAP[name])) ??
    (() => import('@/pages/Placeholder'))
  );
};

// ★⑥硬排除(落地页由静态路由承担):补 /force-change-pwd(静态路由承担,
// 动态菜单同轨 path 不得抢占)
const STATIC_PATHS = new Set([
  '/login',
  '/org-select',
  '/welcome',
  '/force-change-pwd',
]);

/** 路由级 loading(lazy 组件的 Suspense 兜底) */
function PageLoading() {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: '#999' }}>
      加载中...
    </div>
  );
}

/** import 函数 → 可渲染 element(★react-router RouteObject 只认 element,component 字段无效) */
function toRouteElement(loader: () => Promise<any>) {
  const Comp = lazy(loader);
  return createElement(
    Suspense,
    { fallback: createElement(PageLoading) },
    createElement(Comp),
  );
}

/** 收集静态路由树全部 path(children/routes 两种嵌套形态都走一遍) */
function collectStaticPaths(
  list: any[],
  acc: Set<string> = new Set(),
): Set<string> {
  for (const r of list ?? []) {
    if (r?.path) acc.add(String(r.path));
    const kids = r?.children ?? r?.routes;
    if (Array.isArray(kids)) collectStaticPaths(kids, acc);
  }
  return acc;
}

export interface InitialState {
  currentUser?: CurrentUser;
  login?: LoginResult; // 登录全量 vo(notices 渲染 / 机构切换数据源)
  perm?: PermContext; // 归一化权限上下文(随机构切换更新)
}

/** 裸页:登录页 + 强制改密页 + 机构选择页(★⑥补 /force-change-pwd:
 * 非改密期直接访问该路由时,菜单/顶栏不渲染,呈现裸页效果) */
const onBarePage = () =>
  ['/login', '/org-select', '/force-change-pwd'].some((p) =>
    history.location.pathname.startsWith(p),
  );
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
  pick(u, 'name', 'userName', 'uName', 'account', 'uAccount') || '用户';
const displayRole = (u: any): string =>
  pick(u, 'uRole', 'roleName', 'role', 'roleNames') || '系统管理';

const gotoLoginWithRedirect = () => {
  const { pathname, search } = history.location;
  history.replace(`/login?redirect=${encodeURIComponent(pathname + search)}`);
};

/* ───── 刷新恢复(§7:新 /auth/me 与 login 同构,一次调用全覆盖) ───── */
export async function getInitialState(): Promise<any> {
  const token = localStorage.getItem('token');
  if (!token) return { login: null, perm: null, notices: [] };
  try {
    const me = await fetchMe();
    if (me === null) {
      clearAuth();
      return { login: null, perm: null, notices: [] };
    } // §12-2 软删=字面 null

    // ★⑦强制改密拦截(刷新/直输 URL 兜底):loginStatus=3(密码被管理员重置)→
    // 除改密页外全部重定向;SPA 内导航由 layout.onPageChange 兜底;
    // 业务页内容由 layout.childrenRender 渲染级闸门兜死(★⑨)
    if (
      String((me.user as any)?.loginStatus ?? '') === LOGIN_STATUS.RESET &&
      !history.location.pathname.startsWith('/force-change-pwd')
    ) {
      history.replace('/force-change-pwd');
    }

    const orgs = me.orgs ?? [];
    if (me.isAdmin === true) {
      if (me.adminType === 1) {
        // type1:lastOrgId 命中且非 empty → 直接恢复进系统;否则未选态(orgId=null)→ 守卫拦去 org-select
        const last = Number(localStorage.getItem('lastOrgId'));
        const hit = orgs.find((o) => o.org.miId === last && !o.empty); // ★命中还需 !empty(禁点契约)
        if (hit) {
          setOrgId(hit.org.miId);
          saveDynRoutes(hit.menus ?? []);
          return {
            login: me,
            notices: me.notices ?? [],
            perm: buildPermContext(me, { ctx: hit, orgId: hit.org.miId }),
          };
        }
        return {
          login: me,
          notices: me.notices ?? [],
          perm: buildPermContext(me),
        }; // 未选态
      }
      // type2:defaultOrgId=user.miId 默认已选中 → 自动进本机构,不落 org-select
      const own = orgs.find((o) => o.org.miId === me.defaultOrgId) ?? orgs[0];
      if (own && !own.empty) {
        setOrgId(own.org.miId);
        saveDynRoutes(own.menus ?? []);
        return {
          login: me,
          notices: me.notices ?? [],
          perm: buildPermContext(me, { ctx: own, orgId: own.org.miId }),
        };
      }
      return {
        login: me,
        notices: me.notices ?? [],
        perm: buildPermContext(me),
      };
    }
    // type3:顶层即完整上下文(勿传 selected,否则错标 isAdmin:true)
    setOrgId(me.user?.miId);
    saveDynRoutes(me.menus ?? []);
    return { login: me, notices: me.notices ?? [], perm: buildPermContext(me) };
  } catch (e) {
    console.error('[getInitialState]', e);
    clearAuth();
    return { login: null, perm: null, notices: [] };
  }
}

/** ★时序:patchClientRoutes 先于 getInitialState 执行 → 同步读 localStorage 描述;
 * 配合登录/选机构成功后的整页刷新(window.location.replace)让 patch 拿到新数据 */
export function patchClientRoutes({ routes }: { routes: IRoute[] }) {
  const descs = readDynRoutes();
  if (!descs.length) return;
  // ★静态树已有的 path 一律让位:后端 2000 系菜单路径与静态路由刻意同轨,
  // 真实页面(/user、/system/role、/system/menu、/dept、/dict、/org/mi、/mi-config…)由静态路由承担,
  // 动态只补静态没有的路径(药事管理/业务办理/三级药库/溯源与统计/系统设置/用户组管理等)
  const staticPaths = collectStaticPaths(routes as any[]);
  const built = descs
    .filter(
      (d) => d.path && !staticPaths.has(d.path) && !STATIC_PATHS.has(d.path),
    )
    .map((d) => ({
      path: d.path,
      name: d.name,
      element: toRouteElement(resolveComponent(d.component)), // ★必须 element(component 字段会被当空路由)
    }));
  if (!built.length) return;
  const host = (routes.find(
    (r: any) => Array.isArray(r.routes) && r.routes.length,
  ) ??
    routes.find((r: any) => Array.isArray(r.children) && r.children.length) ??
    routes[0]) as any;
  (host.routes ?? host.children)?.unshift(...built);
}

export const request: RequestConfig = {
  requestInterceptors: [
    (url: string, options: any) => {
      const token = localStorage.getItem('token');
      if (token) {
        const auth = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
        options.headers = { ...options.headers, Authorization: auth };
      }
      const orgId = getOrgId(); // §8:仅审计透传,未设置不带
      if (orgId) options.headers = { ...options.headers, 'X-Org-Id': orgId };
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

/* ───── 全局无滚动样式 ───── */
const GlobalStyles: React.FC = () => (
  <style>{`
    html, body, #root { height: 100%; overflow: hidden; }
    .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
    .no-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }
  `}</style>
);

/* ───── 侧栏折叠小 store ───── */
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

/* ───── 顶栏日期 ───── */
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
const HeaderDate: React.FC = () => {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span
      style={{
        whiteSpace: 'nowrap',
        color: 'rgba(0,0,0,0.45)',
        fontSize: 14,
      }}
    >
      {now.format('YYYY年M月D日')} 星期{WEEK_CN[now.day()]}
    </span>
  );
};

/* ───── 顶栏 ───── */
const GlobalHeader: React.FC<{ user: any; noticeCount: number }> = ({
  user,
  noticeCount,
}) => (
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
      <OrgSwitcher />
      {noticeCount > 0 ? (
        <Badge count={noticeCount} size="small">
          <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
        </Badge>
      ) : (
        <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
      )}
      <Dropdown
        menu={{
          items: [
            { key: 'changePwd', icon: <KeyOutlined />, label: '修改密码' },
            { type: 'divider' },
            { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' },
          ],
          onClick: ({ key }) => {
            if (key === 'changePwd') openChangePassword();
            if (key === 'logout') {
              if (localStorage.getItem('token')) logoutApi().catch(() => {});
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

/** 路径 → 所属目录 key 链(导航后自动展开;静态/动态共用) */
const LEAF_GROUP_MAP: Record<string, string[]> = {};
const buildMenuItems = (list: RouteItem[], chain: string[] = []): ItemType[] =>
  list
    .filter((r) => r.name && r.path !== '/' && r.path !== '/login')
    .map((r) => {
      if (r.routes?.length) {
        const groupKey = r.menuPath ?? r.path ?? `group:${r.name}`;
        r.routes.forEach((leaf) => {
          if (leaf.path) LEAF_GROUP_MAP[leaf.path] = [...chain, groupKey];
        });
        return {
          key: groupKey,
          icon: iconOf(r.icon),
          label: r.name,
          children: buildMenuItems(r.routes, [...chain, groupKey]),
        };
      }
      if (r.path) LEAF_GROUP_MAP[r.path] = chain;
      return { key: r.path ?? '', icon: iconOf(r.icon), label: r.name };
    });

const SIDE_MENU_ITEMS = buildMenuItems(routes);

/** 静态兜底过滤:allow 空 = 不过滤 */
function filterMenuItems(items: ItemType[], allow?: string[]): ItemType[] {
  if (!allow?.length) return items;
  const set = new Set(allow);
  const walk = (list: ItemType[]): ItemType[] =>
    list
      .map((it: any) => {
        if (it?.children?.length) {
          const kids = walk(it.children);
          return kids.length ? { ...it, children: kids } : null;
        }
        return it?.key && set.has(String(it.key)) ? it : null;
      })
      .filter(Boolean) as ItemType[];
  return walk(items);
}

/* ───── 后端菜单树 → antd items(§6 全规则) ───── */
// ★与 permission.ts 的 LEGACY_MENU_CUTOFF 同值:顶层滤 727 系老菜单(两代并存去重);
// 后端完成老菜单数据清理(下线 id<2000 的目录/页面,menuType=2 按钮行不动)后,
// 此过滤与 permission.ts 侧过滤一并移除
const LEGACY_MENU_CUTOFF = 2000;

/** 叶子路径 → query 路由参数(queryParam 为 JSON 字符串;由 SiderMenu onClick 统一消费,避免双 push 丢 query) */
const MENU_QUERY_MAP: Record<string, Record<string, string>> = {};
// ★严禁 export:Umi 会把 app.tsx 的每个导出函数注册为运行时插件,非 hook 名启动即白屏
function toMenuItems(
  menus: MenuVO[] = [],
  parentAbs?: string,
  chain: string[] = [],
  seen: Set<string> = new Set(),
): any[] {
  const all = (menus ?? []).filter((m) => m.isVisible === 1);
  // ★仅顶层过滤 727 系老菜单(children 全是 2000 系,不判 id)
  const list =
    parentAbs === undefined
      ? all.filter((m) => Number(m.id) >= LEGACY_MENU_CUTOFF)
      : all;
  return list
    .map((m) => {
      if (m.isExternal === 0) {
        // §6 反转:0=外链。1=新窗 2=当前窗
        return {
          key: `ext-${m.id}`,
          label: m.name,
          icon: iconOf(m.logo ?? undefined),
          onClick: () => {
            if (!m.routing) return;
            if (m.externalTarget === 1) window.open(m.routing);
            else window.location.href = m.routing;
          },
        };
      }
      const path = computeMenuPath(m, parentAbs);
      const kids = (m.children ?? []).filter((c) => c.isVisible === 1);
      // ★201000 型:menuType=1(页面)却带子菜单 → 渲染为子菜单;自身页面作为第一项
      if (kids.length > 0) {
        const subChain = [...chain, `dir-${m.id}`];
        const childItems = toMenuItems(m.children ?? [], path, subChain, seen);
        if (m.menuType === 1 && !seen.has(path)) {
          seen.add(path);
          let q: Record<string, string> | undefined;
          if (m.queryParam) {
            try {
              q = JSON.parse(m.queryParam);
            } catch {
              /* 保持 undefined */
            }
          }
          MENU_QUERY_MAP[path] = q ?? {};
          LEAF_GROUP_MAP[path] = subChain;
        }
        const self =
          m.menuType === 1
            ? [
                {
                  key: path,
                  label: m.name,
                  icon: iconOf(m.logo ?? undefined),
                },
              ]
            : [];
        return {
          key: `dir-${m.id}`,
          label: m.name,
          icon: iconOf(m.logo ?? undefined),
          children: [...self, ...childItems],
        };
      }
      if (m.menuType === 0) {
        return {
          key: `dir-${m.id}`,
          label: m.name,
          icon: iconOf(m.logo ?? undefined),
          children: toMenuItems(
            m.children ?? [],
            path,
            [...chain, `dir-${m.id}`],
            seen,
          ),
        };
      }
      if (seen.has(path)) return null; // 同路径去重
      seen.add(path);
      let query: Record<string, string> | undefined;
      if (m.queryParam) {
        try {
          query = JSON.parse(m.queryParam);
        } catch {
          /* 保持 undefined */
        }
      }
      MENU_QUERY_MAP[path] = query ?? {};
      LEAF_GROUP_MAP[path] = chain;
      return { key: path, label: m.name, icon: iconOf(m.logo ?? undefined) };
    })
    .filter(Boolean);
}

/* ───── 侧栏 ───── */
const SiderMenu: React.FC<{
  items: ItemType[];
  user: any;
  collapsed: boolean;
  onToggle: () => void;
  title?: React.ReactNode;
  logo?: React.ReactNode;
}> = ({ items, user, collapsed, onToggle, title, logo }) => {
  const location = useLocation();
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([
    location.pathname,
  ]);
  useEffect(() => {
    if (onBarePage()) return;
    setSelectedKeys([location.pathname]);
    setOpenKeys(LEAF_GROUP_MAP[location.pathname] ?? []); // 静态/动态统一:目录 key 链自动展开
  }, [location.pathname]);
  const handleOpenChange = (keys: string[]) => {
    setOpenKeys(keys); // ★嵌套目录需多级同时展开;自动展开定位仍由 useEffect + LEAF_GROUP_MAP 负责
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
          ) : typeof logo === 'function' ? (
            createElement(logo as any) // ★④ProLayout 传入的 LogoIcon 是函数组件,须实例化后再渲染
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
            {title ?? '麻精药品追溯管理平台'}
          </span>
          <Button
            type="text"
            size="small"
            icon={<MenuFoldOutlined />}
            onClick={onToggle}
          />
        </div>
      )}
      <Menu
        mode="inline"
        className="no-scrollbar"
        items={items}
        selectedKeys={selectedKeys}
        openKeys={openKeys}
        onOpenChange={handleOpenChange}
        onClick={({ key }) => {
          const k = String(key);
          if (k.startsWith('ext-') || k.startsWith('dir-')) return; // 外链走 item 自身 onClick;目录仅开合
          const q = MENU_QUERY_MAP[k];
          history.push(
            q && Object.keys(q).length ? { pathname: k, query: q } : k,
          );
        }}
        inlineCollapsed={collapsed}
        style={{
          flex: 1,
          minHeight: 0,
          borderInlineEnd: 'none',
          overflowY: 'auto',
        }}
      />
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

/* ───── 布局 ───── */
export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  const state = initialState as InitialState;
  const perm = state?.perm;
  const user = (state?.login?.user ?? state?.currentUser) as any;
  const collapsed = useSiderCollapsed();
  const siderW = collapsed ? COLLAPSED_WIDTH : SIDER_WIDTH;
  const noticeCount = (state?.login?.notices ?? []).length;
  // ★动态菜单优先(后端已按机构+权限滤好);空回退静态骨架
  const dynMenus = perm?.menus ?? [];
  const menuItems: ItemType[] = dynMenus.length
    ? toMenuItems(dynMenus)
    : filterMenuItems(SIDE_MENU_ITEMS, perm?.menuPaths);

  // ★⑨渲染级改密闸门:loginStatus=3(密码被管理员重置)→ 无论当前 URL 是什么,
  // 菜单一律不渲染、内容区一律替换为改密表单,业务页 children 直接丢弃
  //(组件不挂载 → useEffect/请求一行不发,换 URL 绕不过);
  // 改密成功 clearAuth 回登录页,重登后 initialState 刷新为 loginStatus=2,闸门自动解除
  const forcedPwd =
    String((state?.login?.user as any)?.loginStatus ?? '') ===
    LOGIN_STATUS.RESET;

  return {
    title: '麻精药品追溯管理平台',
    layout: 'side',
    fixSiderbar: true,
    fixedHeader: false,
    siderWidth: siderW,
    // ★⑨改密期:菜单一律不渲染(含 /force-change-pwd 裸页)
    menuRender: (props) =>
      forcedPwd || onBarePage() ? null : (
        <SiderMenu
          items={menuItems}
          user={user}
          collapsed={collapsed}
          onToggle={() => setSiderCollapsed(!collapsed)}
          title={(props as any).title}
          logo={(props as any).logo}
        />
      ),
    headerRender: () => null,
    // ★⑨改密期:内容区全出血(无侧栏宽度补偿)
    contentStyle:
      forcedPwd || onBarePage()
        ? { padding: 0 }
        : {
            padding: 0,
            marginLeft: siderW,
            width: `calc(100% - ${siderW}px)`,
            transition: 'margin-left 0.2s, width 0.2s',
          },
    onPageChange: () => {
      const { pathname } = history.location;
      if (!localStorage.getItem('token') && !onLoginPage()) {
        gotoLoginWithRedirect();
        return;
      }
      // ★⑧强制改密 URL 归位(cosmetic;真正拦截在 childrenRender 渲染级):
      // loginStatus=3 → 除改密页/登录页外全部重定向,改密前不进任何业务页
      if (forcedPwd && pathname !== '/force-change-pwd' && !onLoginPage()) {
        history.replace('/force-change-pwd');
        return;
      }
      // type1 未选机构(perm.orgId===null,由 UNSELECTED_ADMIN_PERM 保证)→ 拦在机构选择页
      // ★⑧排除 /force-change-pwd:强制改密优先于选机构,避免两守卫互踢
      if (
        perm?.isAdmin &&
        perm?.adminType === 1 &&
        !perm?.orgId &&
        pathname !== '/org-select' &&
        pathname !== '/force-change-pwd' &&
        !onLoginPage()
      ) {
        history.replace('/org-select');
      }
    },
    childrenRender: (children) => {
      // ★⑨渲染级闸门:改密期无条件把内容区替换为改密表单(静态导入的 ForceChangePwd,
      // 不依赖路由 chunk,不可能白屏);业务 children 被丢弃 → 不挂载、零请求
      if (forcedPwd) {
        return (
          <>
            <GlobalStyles />
            <ForceChangePwd />
          </>
        );
      }
      return onBarePage() ? (
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
          <GlobalStyles />
          <GlobalHeader user={user} noticeCount={noticeCount} />
          <GlobalTabs />
          <GlobalNotices />
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
      );
    },
  };
};
