/**
 * 角色管理 services —— 契约唯一基准：角色管理模块.md v1.0（2026-10-27）
 * ⚠️ code 机构内唯一（uk_mi_code）且创建后锁定（§6.4）：update 传不一致值后端报错
 *    「角色编码创建后不允许修改」——表单编辑态 disabled，提交时强制回填原值
 * ⚠️ miId=0 表示平台级（默认值）：数字 0 在清洗层原样保留（cleanPayload 只吞空串），无需豁免键
 * ⚠️ remark 空串统一落 NULL（§2.4）：提交统一走 cleanPayload，本模块无豁免键
 * ⚠️ menuIds 三态（§6.4）：授权必传数组（null 后端报错「不能为 null」）；[] = 清空；非空 = 全量覆盖。
 *    全量覆盖 + 树按 status=1 过滤 → 「已停用菜单的历史授权」提交时须原样保留（见 AssignMenuModal）
 * ⚠️ 分页返回 MyBatis-Plus IPage{records,total,size,current,pages}（§2.3）：本层返回原结构，
 *    ProTable 适配在页面 request 回调做（{data,total,success}），后端不做统一 wrapper
 * ⚠️ 无启用/停用接口（区别于菜单模块 setMenuStatus）：删除即逻辑删（del_flag=2），
 *    恢复/启停接口【待后端 §4】，前端操作列暂不预留
 */
import { bizRequest } from '@/services/auth';
import { cleanPayload } from '@/utils/payload'; // R2：唯一来源（空串→null；数字 0 原样保留）

// ===== 枚举（§6.2 字段字典；后端 tinyint 恒为数字，渲染比较仍走 shared 的 S() 归一）=====
/** roleType：1平台 2医院 4区域 */
export const ROLE_TYPE = { PLATFORM: 1, HOSPITAL: 2, REGION: 4 } as const;
/** dataScope：1全部 2本部门 3本部门及以下（本期仅存字段，二期接 SQL 拦截） */
export const DATA_SCOPE = { ALL: 1, DEPT: 2, DEPT_AND_CHILD: 3 } as const;
/** roleScope：1公共 2普通 */
export const ROLE_SCOPE = { PUBLIC: 1, NORMAL: 2 } as const;
/** delFlag：1正常 2删除（逻辑删除；无恢复接口【待后端】） */
export const DEL_FLAG = { NORMAL: 1, DELETED: 2 } as const;

// ===== 类型 =====
export type RoleVO = {
  id: number;
  name: string;
  /** 机构内唯一，创建后锁定 */
  code: string;
  /** 机构 id；0=平台级 */
  miId: number;
  roleType: number; // 1平台 2医院 4区域
  dataScope: number; // 1全部 2本部门 3本部门及以下
  roleScope: number; // 1公共 2普通
  sort?: number;
  remark?: string | null; // 后端空串统一落 NULL
  delFlag?: number;
  createTime?: string;
  updateTime?: string | null;
};

/** 新增/修改入参：新增无 id；修改必传 id 且 code 必须与原值一致 */
export type RoleSaveDTO = {
  id?: number;
  name: string;
  code: string;
  /** 不传=0（平台级）【待确认：是否允许前端指定，暂不暴露】 */
  miId?: number;
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
  delFlag?: number;
};

/** MyBatis-Plus IPage 原始结构（§2.3：不做统一 wrapper） */
export type IPage<T> = {
  records: T[];
  total: number;
  size: number;
  current: number;
  pages: number;
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

/** 查已分配菜单 id（§2.2） */
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

/** 修改（id 必传；code 锁定——传不一致值后端报错，前端编辑态 disabled + 强制回填原值） */
export function updateRole(
  data: RoleSaveDTO & { id: number },
): Promise<{ message: string }> {
  return bizRequest('/api/role', { method: 'PUT', data: cleanPayload(data) });
}

/** 删除（逻辑删除 del_flag=2；当前无 t_user_role 校验【后端 TODO】，前端文案不承诺可恢复） */
export function deleteRole(id: number): Promise<{ message: string }> {
  return bizRequest(`/api/role/delete/${id}`, { method: 'DELETE' });
}

/**
 * 分配菜单（全量覆盖，§2.2）
 * ⚠️ 本接口不走 cleanPayload：menuIds=[] 是「清空」语义，严禁被清洗为 null
 */
export function assignMenus(data: AssignMenusDTO): Promise<{ message: string }> {
  return bizRequest('/api/role/assign/menus', { method: 'PUT', data });
}
