/**
 * 用户组 service —— 对齐《用户组管理 · 前端开发方案 v1》§2.1
 * ⚠️ 本工程口径：bizRequest 已解包统一响应体（{code,message,data} wrapper），
 * 各函数直接返回业务数据；code≠200 由 bizRequest 抛 Error(message) → 页面 toast。
 * 方案 §2.2/§2.3 的 request+res.data+success 渲染模式在本工程不适用（User/Role 先例）。
 */
import { bizRequest } from '@/services/auth'; // 与 org/user.ts 同源导入，以现有文件为准
import type { IPage } from '@/utils/types';
import { FMT_DATE, FMT_DATETIME } from '@/utils/format'; // ★A5 常量唯一来源（R5）

// ★A5 对外 re-export：引用方（MemberAddModal 等）import 路径零改动
export { FMT_DATE, FMT_DATETIME };

// ===== 枚举（红线：一律 String() 归一化比较，不做 TS 断言窄化）=====
export const GROUP_TYPE = { DEPT: '1', POST: '2', SPECIAL: '3', TEMP: '4' } as const;
export const NARCOTIC = { YES: '1', NO: '2' } as const;
export const GROUP_STATUS = { NORMAL: '1', DISABLED: '2' } as const;
export const AUTO_EXPIRE_ACTION = { REMIND: '1', DISABLE: '2', DISABLE_UNAUTH: '3' } as const;

/** deptScope JSON 结构（表单内结构化编辑，提交 JSON.stringify / 回显 JSON.parse+try-catch） */
export interface DeptScope {
  deptIds?: number[];
  deptTypes?: string[];
  posts?: string[];
}

export interface UserGroupSaveDTO {
  id?: number;
  groupCode: string;
  groupName: string;
  miId: number;
  groupType: string;
  /** JSON.stringify(DeptScope)；type=3/4 可不传 */
  deptScope?: string;
  isNarcoticGroup: string; // '1'|'2'
  validFrom?: string; // yyyy-MM-dd
  validTo?: string;
  autoExpireAction: string;
  ownerUserId?: number;
  remark?: string; // 空串提交前转 undefined（后端空串落 NULL）
}

export interface UserGroupQueryDTO {
  keyword?: string; // 名称或编码单字段模糊（后端 or，勿拆两字段）
  miId?: number;
  groupType?: string;
  isNarcoticGroup?: string;
  status?: string;
  page?: number;
  size?: number;
}

export interface UserGroupVO {
  id: number;
  groupCode: string;
  groupName: string;
  miId: number | null;
  groupType: string | number | null;
  deptScope: string | null;
  isNarcoticGroup: string | number | null;
  validFrom: string | null;
  validTo: string | null;
  autoExpireAction: string | number | null;
  ownerUserId: number | null;
  ownerName: string | null; // 后端补全，null 显 -
  memberCount: number | null;
  status: string | number | null;
  remark: string | null;
  createTime: string | null;
}

export interface MemberVO {
  id: number; // 绑定行 id
  userId: number | null; // ghost 行（用户已注销）为 null → 禁勾选（batch-remove 按 userIds）
  account: string | null;
  name: string | null;
  post: string | null;
  deptName: string | null; // 用户无默认部门 → null → '-'
  joinSource: string | number | null;
  validFrom: string | null; // yyyy-MM-dd HH:mm:ss
  validTo: string | null;
  createTime: string | null;
}

export interface MemberQueryDTO {
  keyword?: string; // 姓名/账号/拼音码
  deptId?: number; // 用户默认部门口径
  page?: number;
  size?: number;
}

export interface BatchAddResultVO {
  mode: 'direct' | 'confirm'; // confirm=P0 不会出现但代码现在就写（⑤表封存，前向兼容）
  added: number;
  confirmId: number | null;
  skipped: { userId: number; reason: string }[];
}

// ===== 组 CRUD / 启停 =====

export function createUserGroup(
  data: UserGroupSaveDTO,
): Promise<{ id: number; message: string }> {
  return bizRequest('/api/userGroup', { method: 'POST', data });
}

export function updateUserGroup(
  data: UserGroupSaveDTO,
): Promise<{ message: string }> {
  return bizRequest('/api/userGroup', { method: 'PUT', data });
}

/** 删除=物理删成员行；前端确认文案必须含成员清理警示（方案 §3.3） */
export function deleteUserGroup(id: number): Promise<{ message: string }> {
  return bizRequest(`/api/userGroup/delete/${id}`, { method: 'DELETE' });
}

export function fetchUserGroupPage(
  params: UserGroupQueryDTO,
): Promise<IPage<UserGroupVO>> {
  return bizRequest('/api/userGroup/page', { method: 'GET', params });
}

export function fetchUserGroupDetail(id: number): Promise<UserGroupVO> {
  return bizRequest(`/api/userGroup/detail/${id}`);
}

/** 启用过期组 → 后端 500 文案 toast 原样（勿本地拦截改写） */
export function changeUserGroupStatus(
  id: number,
  status: 1 | 2,
): Promise<{ message: string }> {
  return bizRequest(`/api/userGroup/${id}/status`, {
    method: 'PUT',
    data: { status },
  });
}

// ===== 成员 =====

export function fetchMembersPage(
  id: number,
  params: MemberQueryDTO,
): Promise<IPage<MemberVO>> {
  return bizRequest(`/api/userGroup/${id}/members/page`, {
    method: 'GET',
    params,
  });
}

/** ≤200 前端硬拦（超出禁提）；skipped 为正常回执不走 toast（方案 §2.3） */
export function batchAddMembers(
  id: number,
  data: { userIds: number[]; validFrom?: string; validTo?: string },
): Promise<BatchAddResultVO> {
  return bizRequest(`/api/userGroup/${id}/members/batch-add`, {
    method: 'PUT',
    data,
  });
}

/** 未在组内 id 后端静默；返回 removed 计数 */
export function batchRemoveMembers(
  id: number,
  userIds: number[],
): Promise<{ removed: number }> {
  return bizRequest(`/api/userGroup/${id}/members/batch-remove`, {
    method: 'PUT',
    data: { userIds },
  });
}

// ===== v1.2 解封④：组授权绑定（接口 10/11）=====

export const GRANT_STATUS = {
  ACTIVE: 1,
  PENDING: 2,
  EXPIRED: 3,
  RELEASED: 4,
} as const;

export interface GrantItem {
  targetId: number;
  /** yyyy-MM-dd（契约 §2.5：组/授权时效不带时间） */
  validFrom?: string;
  validTo?: string;
}

export interface GrantVO {
  id: number;
  grantType: number | string | null; // 1角色 2权限模板(P1)
  targetId: number;
  roleName: string | null;
  /** 1正常 2已删除（已删角色行照常回显，§2.6） */
  roleDelFlag: number | null;
  grantStatus: number | string | null;
  validFrom: string | null;
  validTo: string | null;
  confirmId: number | null;
}

export interface GrantSyncResultVO {
  confirmRequired: boolean;
  confirmId: number | null;
  added: number;
  removed: number;
  updated: number;
}

/** 绑定列表；不传 grantStatus = 1生效中+2未生效（3/4 不回显，前端无需处理其保留） */
export function fetchGroupGrants(
  id: number,
  grantStatus?: number,
): Promise<GrantVO[]> {
  return bizRequest<GrantVO[]>(`/api/userGroup/${id}/grants`, {
    method: 'GET',
    params: grantStatus != null ? { grantStatus } : undefined,
  });
}

/** 全量软同步。⚠️ grants 三态：[]=清空 / null=报错 / 非空=覆盖——
 *  严禁过 cleanPayload（roleIds/deptIds 同款红线） */
export function syncGroupGrants(
  id: number,
  grants: GrantItem[],
): Promise<GrantSyncResultVO> {
  return bizRequest<GrantSyncResultVO>(`/api/userGroup/${id}/grants`, {
    method: 'PUT',
    data: { grants },
  });
}

// ===== v1.2 解封⑤：合规确认（接口 12-15）=====

export const CONFIRM_STATUS = {
  PENDING: 1,
  APPROVED: 2,
  REJECTED: 3,
  TIMEOUT: 4,
} as const;

export interface ConfirmPayloadGrant {
  targetId: number;
  roleName: string;
  dataScope?: number; // 1全部 2本部门 3本部门及以下
  critical?: boolean;
  validFrom?: string;
  validTo?: string;
}

export interface ConfirmPayloadMember {
  userId: number;
  account: string;
  name: string;
}

export interface ConfirmPayload {
  groupId?: number;
  groupName?: string;
  grants?: ConfirmPayloadGrant[];
  criticalMenus?: string[];
  members?: ConfirmPayloadMember[];
}

export interface ConfirmVO {
  id: number;
  confirmNo: string;
  miId: number | null;
  bizType: number | string | null; // 1组成员变更 2组授权变更
  bizId: number | null;
  bizSummary: string | null;
  /** JSON 字符串，渲染前 parse+try-catch（§2.6） */
  payload: string | null;
  applicantId: number | null;
  applicantName: string | null;
  reviewerId: number | null;
  reviewerName: string | null;
  status: number | string | null;
  rejectReason: string | null;
  expireTime: string | null;
  confirmTime: string | null;
  createTime: string | null;
}

/** message=「已通过并执行」|「已驳回」；自动驳回时 rejectReason=重校验失败原因（HTTP 仍 200，§7.3 按警告渲染） */
export interface ConfirmResultVO {
  message: string;
  rejectReason: string | null;
}

/** 分页；status 不传 = 默认查待确认（待办口径，§5.2-12） */
export function fetchConfirmPage(params: {
  status?: number;
  page?: number;
  size?: number;
}): Promise<IPage<ConfirmVO>> {
  return bizRequest<IPage<ConfirmVO>>('/api/compliance/confirm/page', {
    method: 'GET',
    params,
  });
}

export function fetchConfirmDetail(id: number): Promise<ConfirmVO> {
  return bizRequest<ConfirmVO>(`/api/compliance/confirm/${id}`);
}

/** 通过=执行（执行前全量重校验，失败自动驳回仍 200） */
export function approveConfirm(id: number): Promise<ConfirmResultVO> {
  return bizRequest<ConfirmResultVO>(`/api/compliance/confirm/${id}/approve`, {
    method: 'PUT',
  });
}

export function rejectConfirm(
  id: number,
  reason: string,
): Promise<ConfirmResultVO> {
  return bizRequest<ConfirmResultVO>(`/api/compliance/confirm/${id}/reject`, {
    method: 'PUT',
    data: { reason },
  });
}

// ===== v1.2 解封⑥：授权审计（接口 16-18，只读）=====

export const AUDIT_ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'GRANT', 'REVOKE', 'EXPIRE',
  'APPROVE', 'REJECT', 'TIMEOUT', 'ENABLE', 'DISABLE',
] as const;

export interface AuditVO {
  id: number;
  batchId: string | number | null;
  bizType: number | string | null; // 1组管理 2成员变更 3组授权 4直接授权 5确认单流转 6定时任务
  bizId: number | null;
  targetUserId: number | null;
  action: string | null;
  operatorId: number | null;
  operatorName: string | null;
  miId: number | null;
  source: number | string | null; // 1后台手动 2导入 3事件 4定时任务 5确认单执行
  narcoticFlag: number | string | null; // 1涉麻精 2否
  beforeSnapshot: string | null;
  afterSnapshot: string | null;
  confirmId: number | null;
  /** 人类可读链路描述 */
  remark: string | null;
  createTime: string | null;
}

export interface NarcoticChainVO {
  time: string | null;
  action: string | null;
  path: string | null;
  operator: string | null;
  confirmId: number | null;
}

export function fetchAuditPage(params: {
  batchId?: string;
  bizType?: number;
  action?: string;
  operatorId?: number;
  narcoticFlag?: number;
  startTime?: string;
  endTime?: string;
  page?: number;
  size?: number;
}): Promise<IPage<AuditVO>> {
  return bizRequest<IPage<AuditVO>>('/api/authAudit/page', {
    method: 'GET',
    params,
  });
}

export function fetchAuditBatch(batchId: string): Promise<AuditVO[]> {
  return bizRequest<AuditVO[]>(`/api/authAudit/batch/${batchId}`);
}

/** 三参数全必填；单次上限 500 条。★反馈⑫ 已关闭：参数名 userId/startTime/endTime
 *  已对照后端 AuthAuditController.userNarcoticChain(NarcoticChainQueryDTO) 证实，
 *  联调时抓包终验一次即可 */
export function fetchNarcoticChain(params: {
  userId: number;
  startTime: string;
  endTime: string;
}): Promise<NarcoticChainVO[]> {
  return bizRequest<NarcoticChainVO[]>('/api/authAudit/user-narcotic-chain', {
    method: 'GET',
    params,
  });
}
