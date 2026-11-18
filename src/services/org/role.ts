/**
 * 角色管理 services —— 契约基准：角色管理模块.md v1.0（M1~M3 后端已全量闭环）
 * 状态口径（OPT-01 已联调）：status=停用（可恢复，1正常 2停用）；
 *   delFlag=删除（不可恢复，已删角色不出现在列表）——两者独立，前端无需处理删除态渲染
 * ⚠️ code 机构内唯一（uk_mi_code）且创建后锁定（§6.4）：update 传不一致值后端报 4101，
 *    编码重复报 4102（OPT-05 已联调，表单按 code 内联提示）
 * ⚠️ miId 后端登录态强制填充（OPT-08 已闭环）：前端不提交，SaveDTO 已移除该字段
 * ⚠️ menuIds 三态（§6.4）：授权必传数组；[] = 清空；全量覆盖口径（含父级）已与后端对齐（OPT-04）
 * ⚠️ 分页返回 IPage 原结构：本层不做 ProTable 适配（页面回调做）；
 *    统一响应体 wrapper 由 bizRequest 解包（OPT-06 已闭环，同 createRole 取值口径）
 * 二期预留：OPT-07 属地筛选 / OPT-09 合规标识 / OPT-12 只读权限清单
 */
import { bizRequest } from '@/services/auth';
import { cleanPayload } from '@/utils/payload'; // R2：唯一来源（空串→null；数字 0 原样保留）
import type { IPage } from '@/utils/types';
// ===== 枚举（§6.2 字段字典；渲染比较走 shared 的 S() 归一化）=====
/** roleType：1平台 2医院 4区域 */
export const ROLE_TYPE = { PLATFORM: 1, HOSPITAL: 2, REGION: 4 } as const;
/** dataScope：1全部 2本部门 3本部门及以下（本期仅存字段，二期接 SQL 拦截） */
export const DATA_SCOPE = { ALL: 1, DEPT: 2, DEPT_AND_CHILD: 3 } as const;
export const ROLE_SCOPE = { PUBLIC: 1, NORMAL: 2 } as const;
/** 角色状态【OPT-01 已联调】：1正常 2停用（停用可恢复） */
export const ROLE_STATUS = { NORMAL: 1, DISABLED: 2 } as const;
/** delFlag：1正常 2删除（逻辑删除；删除绑定校验 4001 已上线 OPT-02） */
export const DEL_FLAG = { NORMAL: 1, DELETED: 2 } as const;

/** 启停入参状态字面量（changeRoleStatus 用） */
export type RoleStatus = (typeof ROLE_STATUS)[keyof typeof ROLE_STATUS];

/**
 * 业务错误（bizRequest reject 抛出；M1 适配层挂 code——4101/4102 表单内联定位用）
 * 若适配层 reject 只透传了 Error(message) 丢了 code，
 * 在 requestErrorConfig 的 reject 分支补一行 error.code = 后端 code 即可
 */
export interface BizError extends Error {
  code?: number;
}

// ===== 类型 =====
export type RoleVO = {
  id: number;
  name: string;
  /** 机构内唯一，创建后锁定 */
  code: string;
  /** 机构 id；0=平台级（后端登录态填充） */
  miId: number;
  roleType: number; // 1平台 2医院 4区域
  dataScope: number; // 1全部 2本部门 3本部门及以下
  roleScope: number; // 1公共 2普通
  /** 1正常 2停用【OPT-01 已联调】 */
  status?: number;
  sort?: number;
  remark?: string | null; // 后端空串统一落 NULL
  delFlag?: number;
  createTime?: string;
  updateTime?: string | null;
};

/** 新增/修改入参：新增无 id；修改必传 id 且 code 必须与原值一致
 *  miId 已移除（OPT-08）：后端登录态强制填充，前端不提交 */
export type RoleSaveDTO = {
  name: string;
  code: string;
  roleType?: number;
  dataScope?: number;
  roleScope?: number;
  sort?: number;
  remark?: string;
};

/** 详情（含 menuIds，用于分配菜单回显）；未授权时 menuIds 可能为 null */
export type RoleDetailVO = RoleVO & { menuIds?: number[] | null };

/** 分页查询（§2.2）：query 全可选 */
export type RoleQuery = {
  page?: number;
  size?: number;
  name?: string;
  code?: string;
  roleType?: number;
  dataScope?: number;
  roleScope?: number;
  /** 状态筛选【OPT-01 已联调】：1正常 2停用，选填 */
  status?: number;
  delFlag?: number;
};


/** 分配菜单入参：menuIds=[] 清空；严禁为 null */
export type AssignMenusDTO = { roleId: number; menuIds: number[] };

// ===== 查询 =====
/** 分页查询（§2.2） */
export function getRolePage(params: RoleQuery): Promise<IPage<RoleVO>> {
  return bizRequest<IPage<RoleVO>>('/api/role/page', { method: 'GET', params });
}

/** 详情（含 menuIds；不存在 → 后端 500） */
export function getRoleDetail(id: number): Promise<RoleDetailVO> {
  return bizRequest<RoleDetailVO>(`/api/role/detail/${id}`);
}

/** 查已分配菜单 id（§2.2；OPT-10 已定稿 number[]，三形态兼容层保留至下迭代清理） */
export function getRoleMenuIds(id: number): Promise<number[]> {
  return bizRequest<number[]>(`/api/role/${id}/menus`);
}

// ===== 写操作 =====
/** 新增（§6.3：返回 {id,message}；remark 空串经 cleanPayload 落 null） */
export function createRole(
  data: RoleSaveDTO,
): Promise<{ id: number; message: string }> {
  return bizRequest('/api/role', { method: 'POST', data: cleanPayload(data) });
}

/** 修改（id 必传；code 锁定 → 4101，编码重复 → 4102【OPT-05 已联调】） */
export function updateRole(
  data: RoleSaveDTO & { id: number },
): Promise<{ message: string }> {
  return bizRequest('/api/role', { method: 'PUT', data: cleanPayload(data) });
}

/** 删除（逻辑删除 del_flag=2；绑定校验 4001 已上线【OPT-02 已联调】，文案含绑定数 N） */
export function deleteRole(id: number): Promise<{ message: string }> {
  return bizRequest(`/api/role/delete/${id}`, { method: 'DELETE' });
}

/**
 * 启用/停用角色【后端已联调：BE-ROLE-OPT-01】
 * PUT /api/role/{id}/status?status=1|2
 * 成功 → { message: '已启用' | '已停用' }（后端返回，直接透传 toast）
 * 失败 → 500 '状态值非法：1正常 2停用' / '角色不存在，id=x'
 * 取值口径同 createRole/updateRole：bizRequest 已解包 wrapper，直接返回 data
 */
export function changeRoleStatus(
  id: number,
  status: RoleStatus,
): Promise<{ message: string }> {
  return bizRequest(`/api/role/${id}/status`, { method: 'PUT', params: { status } });
}

/**
 * 分配菜单（全量覆盖，§2.2；口径已与后端对齐【OPT-04 已闭环】）
 * ⚠️ 本接口不走 cleanPayload：menuIds=[] 是「清空」语义，严禁被清洗为 null
 */
export function assignMenus(data: AssignMenusDTO): Promise<{ message: string }> {
  return bizRequest('/api/role/assign/menus', { method: 'PUT', data });
}

// ===== 角色下拉数据源（契约：用户-角色分配管理 v1.0 §2.2）=====

/** GET /role/options：仅正常角色（status=1），按 sort/id 升序，上限 50 */
export interface RoleOptionVO {
  id: number;
  name: string;
  code: string;
  roleType: number;
}


export function fetchRoleOptions(keyword?: string): Promise<RoleOptionVO[]> {
  return bizRequest<RoleOptionVO[]>('/api/role/options', {
    method: 'GET',
    params: { keyword },
  });
}
