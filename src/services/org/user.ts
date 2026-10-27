/**
 * 用户管理 services —— 契约唯一基准：后端变更说明-用户管理-v3.md（终版 2026-10-14）
 * ⚠️ v3 根治绞名：t_user 列名去 u_ 前缀，JSON key / query 参数全部自然命名
 *   （name/account/miId/type/status/tenantType/sex/.../pyCode）——v2 的 uXxx key 全部作废
 * ⚠️ 路由（§3.2）：/user/detail/{id}、/user/delete/{id}、/user/{id}/status、/user/{id}/reset-password、/user/options
 * ⚠️ 编辑锁定项不进表单不进 payload：account / pwd / miId / status / loginStatus / delFlag（DTO 层亦剔除）
 * ⚠️ account 唯一（含软删）且区分大小写，前后端均不 trim —— Admin ≠ admin（§四/§五）
 * ⚠️ v3 §五：提交空串转 null —— 统一走 @/utils/payload.cleanPayload（R2），account 豁免 noTrim
 * ⚠️ R3：本模块 page 契约 miId 可选（全平台视图，遗留#1/#5），不注入 miId——非遗漏
 * ⚠️ Authorization 裸 token 由 bizRequest 通道统一注入
 */
import { bizRequest } from '@/services/auth';
import type { IPage } from '@/utils/types'; // R1：唯一来源，勿本地声明
import { cleanPayload } from '@/utils/payload'; // R2：唯一来源

/** R5：日期常量唯一来源在 @/utils/format，此处 re-export 兼容页面旧引用 */
export { FMT_DATE, FMT_DATETIME } from '@/utils/format';

// ===== 枚举（v3 §四枚举速查；后端字段类型未定，统一 String 归一化比较）=====
/** type：1系统管理员 / 2机构管理员 / 3医疗机构普通用户（新增默认3）；「4区域用户」永久移除 */
export const USER_TYPE = { ADMIN: '1', ORG_ADMIN: '2', ORG_USER: '3' } as const;
export const USER_STATUS = { NORMAL: '1', LOCKED: '2' } as const;
export const LOGIN_STATUS = { NEVER: '1', LOGGED: '2', RESET: '3' } as const;
/** tenantType：1医院 2区域，必填默认 1（DB 非空列） */
export const USER_TENANT_TYPE = { HOSPITAL: '1', REGION: '2' } as const;
export const USER_SEX = { MALE: '1', FEMALE: '2', UNKNOWN: '9' } as const;
export const USER_IS_TRAINEE = { YES: '1', NO: '2' } as const;
/** prescClass：1麻醉药品 2第一类精神 3第二类精神 4普通处方 */
export const USER_PRESC_CLASS = { NARCOTIC: '1', PSY1: '2', PSY2: '3', NORMAL: '4' } as const;

export type UserVO = {
  id: number;
  account: string;
  name: string;
  pyCode?: string | null;
  miId?: number | null;
  phone?: string | null;
  type: string | number;
  tenantType?: string | number;
  status: string | number;
  loginStatus?: string | number;
  createTime?: string;
  updateTime?: string | null;
  // 基础资料（§四）
  sex?: string | null;
  idCard?: string | null;
  education?: string | null; // 存字典 code【遗留#2】
  entryDate?: string | null; // yyyy-MM-dd
  tel?: string | null;
  email?: string | null;
  // 执业信息（§四）
  post?: string | null; // 存字典 code【遗留#2】
  position?: string | null;
  level?: string | null; // 存字典 code【遗留#2】
  skill?: string | null; // 疑似字典 code【遗留#2】
  workNature?: string | null; // 存字典 code【遗留#2】
  isTrainee?: string | null; // 1是 2否
  certNo?: string | null;
  // 麻精处方权（§四）
  authStartTime?: string | null; // yyyy-MM-dd HH:mm:ss
  authEndTime?: string | null;
  prescClass?: string | null;
};

/**
 * UserSaveDTO（§3.2/§四）：新增/编辑共用。
 * 编辑锁定 6 项不进表单不进 payload：account / pwd / miId / status / loginStatus / delFlag
 */
export type UserSaveDTO = {
  id?: number; // PUT 必传；POST 不传
  account?: string; // POST 必填（不 trim）；编辑锁定
  pwd?: string; // 仅 POST 生效；不传默认 123456
  name: string;
  pyCode?: string; // 留空 → 后端按 name 自动生成；多音字可手填
  miId?: number; // POST 选填【遗留#1 机构数据源待定】；编辑锁定（调动暂无接口）
  phone?: string;
  type?: string;
  tenantType?: string; // 必填默认 1（前端表单必填，后端兜底）
  sex?: string;
  idCard?: string;
  education?: string;
  entryDate?: string; // yyyy-MM-dd
  tel?: string;
  email?: string;
  post?: string;
  position?: string;
  level?: string;
  skill?: string;
  workNature?: string;
  isTrainee?: string;
  certNo?: string;
  authStartTime?: string; // yyyy-MM-dd HH:mm:ss
  authEndTime?: string;
  prescClass?: string;
};

/** 用户下拉选项（§六 UserSelect 数据源） */
export type UserOptionVO = {
  id: number;
  name: string;
  account: string;
  type: string | number;
  post?: string | null;
};

// ===== 查询 =====

/** 分页（§3.2）：query 全可选 miId/keyword/type/tenantType/status；keyword 匹配 姓名/账号/手机号/拼音码
 *  （拼音大小写不敏感）；固定过滤软删；createTime 倒序 */
export function pageUser(params: {
  page?: number;
  size?: number;
  keyword?: string;
  type?: string;
  tenantType?: string;
  status?: string;
  miId?: number; // 【遗留#1/#5】机构数据范围未定前不传（全平台视图，R3 契约可选）
}): Promise<IPage<UserVO>> {
  return bizRequest<IPage<UserVO>>('/api/user/page', { method: 'GET', params });
}

/** 详情（已删/不存在 → 500「用户不存在」）；UserSelect 回显兜底复用 */
export function getUserDetail(id: number): Promise<UserVO> {
  return bizRequest<UserVO>(`/api/user/detail/${id}`);
}

/** 用户下拉（§六）：仅正常用户（非软删非锁定）、上限 50、姓名升序；keyword 匹配 姓名/账号/拼音码。
 *  铁律②不做长缓存——调用方每次进页面拉一次；预留 prescClass/有效期内过滤参数位（麻精模块） */
export function fetchUserOptions(params: {
  miId?: number;
  tenantType?: string;
  type?: string;
  keyword?: string;
}): Promise<UserOptionVO[]> {
  return bizRequest<UserOptionVO[]>('/api/user/options', { method: 'GET', params });
}

// ===== 写操作（出站统一过 cleanPayload；account 豁免 noTrim——区分大小写，R2）=====

/** 新增：account/name 必填；pwd 空 → 123456（成功文案「创建成功，默认密码 123456」透传）；
 *  重复账号 → 500「账号已存在（含已删除账号），请更换账号名」透传 */
export function createUser(data: UserSaveDTO): Promise<{ id: number; message: string }> {
  return bizRequest('/api/user', {
    method: 'POST',
    data: cleanPayload(data, { noTrim: ['account'] }),
  });
}

/** 修改（可改全部资料字段）；null 不更新 → ⚠️ 清空字段无法保存为空（后端限制），见弹窗内提示；
 *  锁定 6 项由调用方保证不出现（DTO 层亦已剔除，双保险） */
export function updateUser(data: UserSaveDTO & { id: number }): Promise<{ message: string }> {
  return bizRequest('/api/user', {
    method: 'PUT',
    data: cleanPayload(data, { noTrim: ['account'] }),
  });
}

/** 删除（软删 del_flag=2）：账号名被占用不可复用（含已删除）；会话惰性失效勿写「立即掉线」 */
export function deleteUser(id: number): Promise<{ message: string }> {
  return bizRequest(`/api/user/delete/${id}`, { method: 'DELETE' });
}

/** 锁定(2)/解锁(1)；status 必传（缺参 → 500 友好文案） */
export function setUserStatus(id: number, status: 1 | 2): Promise<{ message: string }> {
  return bizRequest(`/api/user/${id}/status`, { method: 'PUT', params: { status } });
}

/** 重置密码；newPwd 不传 → 123456 且 loginStatus=3 */
export function resetUserPassword(id: number, newPwd?: string): Promise<{ message: string }> {
  return bizRequest(`/api/user/${id}/reset-password`, {
    method: 'PUT',
    ...(newPwd ? { data: { newPwd } } : {}),
  });
}
