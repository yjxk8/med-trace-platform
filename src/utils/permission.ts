/**
 * 权限上下文 + 动态路由描述(K1 归一化已定版)
 * ★时序契约:patchClientRoutes 先于 getInitialState 执行 → 动态路由描述经 localStorage 持久化,
 *   登录/选机构成功后整页刷新(window.location.replace)让 patch 读到最新描述。
 */
import {
  buildDeptTree,
  type DeptNodeVO,
  type LoginResult,
  type MenuVO,
  type OrgContextVO,
} from '@/services/auth';

export interface PermContext {
  orgId: number | null; // null=type1 未选机构(onPageChange 守卫据此跳 /org-select)
  orgName?: string;
  isAdmin: boolean;
  adminType: number | null;
  menus: MenuVO[]; // 原始菜单树(侧栏直接渲染;后端已按机构+权限滤好)
  menuPaths: string[]; // 可达叶子路径集(access 防线)
  permCodes: string[]; // 权限点编码(system:user:add 等,K2 已定版)
  criticalMenus: string[]; // 麻精关键菜单(K3:当前恒 [])
  depts: DeptNodeVO[];
  roles: unknown[];
  groups: unknown[];
  templates: unknown[];
}

export const FORCE_PWD_FLAG = 'forcePwd';

/* ───── K1 路径归一化 ───── */

/** §6 K1:叶子相对路径 → '/xxx' */
export const normalizeRouting = (routing: string) =>
  routing.startsWith('/') ? routing : `/${routing}`;

/**
 * 统一路径函数:侧栏渲染与动态路由注册共用(点击路径 === 注册路径)。
 * 绝对 routing 直接作锚点;相对 routing 拼到最近绝对锚点
 * (解决同名叶子 stockInquiry×3:/OnePharmacy/stockInquiry 等天然唯一)
 */
export function computeMenuPath(m: MenuVO, parentAbs?: string): string {
  if (m.routing?.startsWith('/')) return m.routing;
  return parentAbs
    ? `${parentAbs}/${m.routing ?? m.id}`
    : normalizeRouting(m.routing ?? `menu-${m.id}`);
}

/** 可见叶子(menuType=1)路径集 → menuPaths */
export function collectLeafPaths(
  menus: MenuVO[] = [],
  parentAbs?: string,
): string[] {
  const out: string[] = [];
  for (const m of menus) {
    if (m.isExternal === 0) continue; // §6 反转:0=外链
    const path = computeMenuPath(m, parentAbs);
    if (m.menuType === 1 && m.isVisible === 1) out.push(path);
    if (m.menuType === 0) out.push(...collectLeafPaths(m.children ?? [], path));
  }
  return out;
}

/* ───── 动态路由描述(localStorage 持久化) ───── */
// ★字面量 'dynamicRoutes' 须与 auth.ts clearAuth 清理 key 一致(勿互相 import,防循环依赖)
export const DYN_ROUTES_KEY = 'dynamicRoutes';
export interface DynRouteDesc {
  path: string;
  name?: string;
  component?: string | null;
}

/** 菜单树 → 可持久化路由描述(仅站内可见叶子;同路径去重先者胜,防 antd key 冲突) */
export function buildDynRouteDescs(
  menus: MenuVO[] = [],
  parentAbs?: string,
): DynRouteDesc[] {
  const out: DynRouteDesc[] = [];
  const seen = new Set<string>();
  const walk = (list: MenuVO[], pa?: string) => {
    for (const m of list) {
      if (m.isExternal === 0 || m.isVisible !== 1) continue;
      const path = computeMenuPath(m, pa);
      if (m.menuType === 1 && !seen.has(path)) {
        seen.add(path);
        out.push({ path, name: m.name, component: m.component ?? null });
      }
      if (m.menuType === 0) walk(m.children ?? [], path);
    }
  };
  walk(menus, parentAbs);
  return out;
}

export function saveDynRoutes(menus: MenuVO[]): void {
  try {
    localStorage.setItem(
      DYN_ROUTES_KEY,
      JSON.stringify(buildDynRouteDescs(menus)),
    );
  } catch {
    /* 容量异常忽略 */
  }
}
export function readDynRoutes(): DynRouteDesc[] {
  try {
    return JSON.parse(
      localStorage.getItem(DYN_ROUTES_KEY) || '[]',
    ) as DynRouteDesc[];
  } catch {
    return [];
  }
}

/* ───── 权限上下文构建 ───── */

/** type1 未选机构态:orgId 必须 null(守卫依赖;user.miId=49 是平台账号自身,不是机构!) */
const UNSELECTED_ADMIN_PERM: PermContext = {
  orgId: null,
  isAdmin: true,
  adminType: 1,
  menus: [],
  menuPaths: [],
  permCodes: [],
  criticalMenus: [],
  depts: [],
  roles: [],
  groups: [],
  templates: [],
};

export function buildPermContext(
  vo: LoginResult,
  selected?: { ctx: OrgContextVO; orgId: number },
): PermContext {
  // 已选机构(type1 选卡片 / type2 刷新命中):orgs[i] 即完整上下文
  if (selected) {
    const { ctx, orgId } = selected;
    return {
      orgId,
      orgName: ctx.org?.miName,
      isAdmin: true,
      adminType: vo.adminType ?? null,
      menus: ctx.menus ?? [],
      menuPaths: collectLeafPaths(ctx.menus ?? []),
      permCodes: ctx.perms ?? [],
      criticalMenus: ctx.criticalMenus ?? [],
      depts: buildDeptTree(ctx.depts ?? []),
      roles: ctx.roles ?? [],
      groups: ctx.groups ?? [],
      templates: ctx.templates ?? [],
    };
  }
  // type2:defaultOrgId=user.miId 默认已选中本机构
  if (vo.isAdmin && vo.adminType === 2 && vo.orgs?.length) {
    const o =
      vo.orgs.find((x) => x.org?.miId === vo.defaultOrgId) ?? vo.orgs[0];
    return {
      orgId: o.org?.miId ?? null,
      orgName: o.org?.miName,
      isAdmin: true,
      adminType: 2,
      menus: o.menus ?? [],
      menuPaths: collectLeafPaths(o.menus ?? []),
      permCodes: o.perms ?? [],
      criticalMenus: o.criticalMenus ?? [],
      depts: buildDeptTree(o.depts ?? []),
      roles: o.roles ?? [],
      groups: o.groups ?? [],
      templates: o.templates ?? [],
    };
  }
  // type1 未选机构 → 守卫态
  if (vo.isAdmin && vo.adminType === 1) return { ...UNSELECTED_ADMIN_PERM };
  // 普通用户(type3):顶层即完整上下文
  return {
    orgId:
      vo.defaultOrgId && vo.defaultOrgId !== 0
        ? vo.defaultOrgId
        : (vo.user?.miId ?? null),
    isAdmin: !!vo.isAdmin,
    adminType: vo.adminType ?? null,
    menus: vo.menus ?? [],
    menuPaths: collectLeafPaths(vo.menus ?? []),
    permCodes: vo.perms ?? [],
    criticalMenus: vo.criticalMenus ?? [],
    depts: buildDeptTree(vo.depts ?? []),
    roles: vo.effectiveRoles ?? [],
    groups: vo.userGroups ?? [],
    templates: vo.templates ?? [],
  };
}

/* ── @deprecated permCtx 快照:§7 新 /auth/me 已全量覆盖,仅为兼容登录页旧调用保留,可删 ── */
const PERM_CACHE_KEY = 'permCtx';
export function savePermCache(vo: LoginResult): void {
  try {
    localStorage.setItem(PERM_CACHE_KEY, JSON.stringify(vo));
  } catch {
    /* 忽略 */
  }
}
export function readPermCache(): LoginResult | undefined {
  try {
    const raw = localStorage.getItem(PERM_CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
export function clearPermCache(): void {
  localStorage.removeItem(PERM_CACHE_KEY);
}
