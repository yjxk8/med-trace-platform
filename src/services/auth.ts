/**
 * 认证/请求基座 —— 契约:后端变更说明-用户管理-v3.md(终版)
 * 本轮:★token 可空(me 恒 null) ★DeptNodeVO 对齐实测(deptId/deptStatus/sortOrder)
 *      ★clearAuth 补清 dynamicRoutes/lastOrgId(防跨账号串路由/串机构) ★OrgItemVO/OrgContextVO 子结构定型
 */
import { history, request } from '@umijs/max';
import { clearOrgId } from '@/utils/orgContext';

/** 当前用户([key: string]: any 容忍后端加字段) */
export interface CurrentUser {
  id?: number | string; account?: string; name?: string;
  type?: string | number; miId?: number | null;
  tenantType?: string | number; status?: string | number; loginStatus?: string | number;
  [key: string]: any;
}

/** 部门节点(2026-11-09 /auth/org-context 实测逐字对齐;扁平 + parentId 前端建树) */
export interface DeptNodeVO {
  deptId: number; deptName: string; parentId: number;
  deptStatus: number; sortOrder: number; children?: DeptNodeVO[];
}

/** 菜单节点(menus 为 children 嵌套,与 depts 扁平不同构,勿共用建树入参) */
export interface MenuVO {
  id: number; name: string; logo?: string | null; clientType?: number;
  menuType: number; perms?: string | null; parentId: number; sort?: number;
  isVisible: number; routing?: string | null; queryParam?: string | null;
  isExternal: number; externalTarget?: number; component?: string | null;
  componentName?: string | null; module?: string | null; status: number;
  children?: MenuVO[];
}

/** 登录机构项(login 响应 orgs[] 元素 = 完整机构上下文,与 OrgContextVO 同构) */
export interface OrgItemVO {
  org: { miId: number; miName: string; miCode: string; status: number; tenantType: number; parentId: number };
  empty: boolean;            // true=该机构无权限数据 → 选择页禁点
  depts: DeptNodeVO[];
  roles: unknown[];
  menus: MenuVO[];
  perms: string[];
  criticalMenus: string[];
  groups: unknown[];
  templates: unknown[];
}

/** 登录后通知(FORCE_PWD 强制改密 / PRES_AUTH_EXPIRE 资质临期) */
export interface NoticeVO { code: string; message: string; }

/** 登录返回 LoginVO:/auth/** 裸对象。★token 仅 login 非空,me 恒 null */
export interface LoginResult {
  token: string | null;
  user: CurrentUser;
  defaultOrgId: number;      // type1=0(需选机构);type2/3=user.miId
  isAdmin: boolean;
  adminType: number | null;  // 契约唯一允许 null 的字段(仅 type3)
  effectiveRoles: unknown[] | null;
  depts: DeptNodeVO[] | null;
  menus: MenuVO[] | null;
  perms: string[] | null;
  criticalMenus: string[] | null;
  userGroups: unknown[] | null;
  notices: NoticeVO[] | null;
  templates: unknown[] | null;
  orgs: OrgItemVO[];
}

const USER_CACHE_KEY = 'user';

export function cacheUser(u?: CurrentUser | null) {
  if (u) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
  else localStorage.removeItem(USER_CACHE_KEY);
}
export function getCachedUser(): CurrentUser | undefined {
  try { const raw = localStorage.getItem(USER_CACHE_KEY); return raw ? JSON.parse(raw) : undefined; } catch { return undefined; }
}

/** ★清理须含 dynamicRoutes/lastOrgId:防跨账号自动恢复上一账号的机构与路由 */
export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem(USER_CACHE_KEY);
  localStorage.removeItem('dynamicRoutes'); // 与 permission.ts DYN_ROUTES_KEY 字面量一致
  localStorage.removeItem('lastOrgId');
  clearOrgId();
}

/* ───── 401 统一处理(防抖) ───── */
let redirecting = false;
export function handle401() {
  if (redirecting) return;
  redirecting = true;
  clearAuth();
  const { pathname, search } = history.location;
  if (!pathname.startsWith('/login')) {
    history.replace(`/login?redirect=${encodeURIComponent(pathname + search)}`);
  }
  setTimeout(() => { redirecting = false; }, 800);
}

/* ───── 响应处理 ───── */
async function unwrap<T>(p: Promise<any>): Promise<T> {
  let body: any;
  try {
    body = await p;
  } catch (e: any) {
    const status = Number(e?.response?.status ?? e?.status);
    if (status === 401 || e?.response?.data?.code === 401) {
      handle401();
      throw new Error(e?.response?.data?.message || '登录已过期，请重新登录');
    }
    if (status === 404) console.error('[HTTP 404 路由不存在]', e?.response?.data?.message || e.message); // §2:联调期可见
    const err: any = new Error(e?.response?.data?.message || e?.message || '网络异常，请稍后重试');
    err.code = e?.response?.data?.code;
    throw err;
  }
  // /auth/** 字面 null(/auth/me 软删用户)→ 直透
  if (body == null) return body as T;
  // 包装结构 {code,message,data}
  if (body && typeof body === 'object' && 'code' in body && 'message' in body) {
    if (body.code === 200) return (body.data ?? null) as T;
    if (body.code === 401) { handle401(); throw new Error(body.message || '登录已过期，请重新登录'); }
    const err: any = new Error(body.message || '请求失败');
    err.code = body.code; // 4101/4102/4402 表单内联依赖
    throw err;
  }
  return body as T; // /auth/** 裸结构
}

export async function bizRequest<T = any>(url: string, options?: any): Promise<T> {
  return unwrap<T>(request(url, options));
}

/* ───── 认证接口 ───── */

export async function login(account: string, pwd: string): Promise<LoginResult> {
  const body = await unwrap<any>(request('/api/auth/login', { method: 'POST', data: { account, pwd } }));
  if (!body?.token) throw new Error(body?.message || '登录响应异常：未返回 token');
  return body as LoginResult;
}

/** 登录后去向:type1→/org-select;其余→/welcome */
export function resolvePostLoginRoute(vo: LoginResult): string {
  if (vo.isAdmin && vo.adminType === 1) return '/org-select';
  return '/welcome';
}

export async function logout(): Promise<void> {
  try { await request('/api/auth/logout', { method: 'POST' }); } catch { /* 静默 */ }
}

/** GET /auth/me(§2/§7/§12-2):字面 null=软删;含 code 字段=失败;成功=裸 LoginVO(token=null,勿覆盖本地 token) */
export async function fetchMe(): Promise<LoginResult | null> {
  const res: any = await request('/api/auth/me', { method: 'GET' });
  if (res === null || res === undefined) return null;
  if (res && typeof res === 'object' && 'code' in res) {
    if (res.code === 401) handle401();
    console.error('[auth/me]', res);
    throw new Error(res.message || '获取用户信息失败');
  }
  return res as LoginResult;
}

/** @deprecated 旧契约遗留:新流程统一走 fetchMe;仅为兼容旧调用保留 */
export async function fetchCurrentUser(token?: string): Promise<CurrentUser | null> {
  const body = await unwrap<any>(request('/api/auth/me', {
    method: 'GET',
    ...(token ? { headers: { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` } } : {}),
  }));
  if (body?.user !== undefined) return body.user;
  if (body && (body.id ?? body.account)) return body as CurrentUser;
  return null;
}

/** PUT /auth/password(≥6 位);成功即踢全部会话 → 调用方必须引导重新登录 */
export async function changePassword(p: { oldPwd: string; newPwd: string }): Promise<void> {
  await unwrap(request('/api/auth/password', { method: 'PUT', data: { oldPwd: p.oldPwd, newPwd: p.newPwd } }));
}

/* ───── 机构上下文 ───── */

export interface OrgContextVO {
  org: OrgItemVO['org'];
  empty: boolean;
  depts: DeptNodeVO[];
  roles: unknown[];
  menus: MenuVO[];
  perms: string[];
  criticalMenus: string[];
  groups: unknown[];
  templates: unknown[];
}

/** type1 任意机构 / type2 仅本机构 / type3 拒绝。GET query 传参(勿用请求体)。注意:有 10 分钟服务端缓存(§8) */
export async function fetchOrgContext(orgId: number | string): Promise<OrgContextVO> {
  const body = await unwrap<any>(request('/api/auth/org-context', { method: 'GET', params: { orgId } }));
  return body as OrgContextVO;
}

/** 扁平 depts 按 parentId 建树(键=deptId);已是嵌套形态时短路直返;禁用节点保留置灰 */
export function buildDeptTree(list: DeptNodeVO[]): DeptNodeVO[] {
  if (!list?.length || list.some((d) => d.children?.length)) return list ?? [];
  const map = new Map<number, DeptNodeVO>();
  list.forEach((d) => map.set(Number(d.deptId), { ...d, children: [] }));
  const roots: DeptNodeVO[] = [];
  map.forEach((node) => {
    const pid = node.parentId != null ? Number(node.parentId) : 0;
    const parent = pid !== 0 ? map.get(pid) : undefined;
    if (parent && parent !== node) parent.children!.push(node);
    else roots.push(node);
  });
  return roots;
}
