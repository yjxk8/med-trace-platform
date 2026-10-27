/**
 * 机构参数配置 services —— 契约唯一基准：后端变更说明-机构参数配置-v1.md（2026-10-14）
 * ⚠️ KV 模型（§一#1）：miId 隔离 + configType 命名空间 + configName 键 → configValue 载荷
 * ⚠️ 复活语义（§6.1）：唯一键不含 del_flag——删除后同键重建复活原行（id 不变、create_time 保留）。
 *   勿长期缓存行 id；删除确认文案不写「彻底删除/不可恢复」
 * ⚠️ 键字段=身份（§6.2）：修改接口只认 configValue/remark；换键=删除+重建
 * ⚠️ 空串豁免（§二/§6.3）：update 的 configValue 传 ""=清空、不传=不改
 *   → R2 cleanPayload 调用传 { keepEmpty: ['configValue'] }（豁免集显式声明，防止复制粘贴丢失语义）
 * ⚠️ /value null 语义（§6.3）：未配置返回 null（200）=正常分支，勿当错误处理；业务方走默认值
 * ⚠️ configValue 不校验格式（§一#6）：通用载荷（常存 JSON ≤2000），格式约束由消费方负责【§八#5】
 * ⚠️ R3：本模块 page 契约 miId 可选（跨机构视图 C10），不注入 miId——非遗漏
 */
import { bizRequest } from '@/services/auth';
import type { IPage } from '@/utils/types'; // R1：唯一来源（本地重复声明已删）
import { cleanPayload } from '@/utils/payload'; // R2：唯一来源

/** MiConfigVO（page/detail/value 出参，§四；不含 delFlag） */
export type MiConfigVO = {
  id: number;
  miId: number;
  configType: string; // 空值规范化为 default（§一#4）
  configName: string; // 空值规范化为 '' = 类型级默认配置（§6.4）
  configValue: string | null;
  remark?: string | null;
  createTime?: string; // 复活后保留原值（§6.1）
  updateTime?: string | null;
  createBy?: number | null;
  updateBy?: number | null;
};

/** MiConfigSaveDTO（§四）：新增全字段；修改仅 configValue/remark 生效（键字段传了也忽略，前端不传） */
export type MiConfigSaveDTO = {
  miId: number; // 新增必填
  configType?: string; // 缺省 default
  configName?: string; // 缺省 ''（类型级默认配置）
  configValue?: string; // 缺省 ''；修改时 ""=清空（keepEmpty 豁免）
  remark?: string;
};

// ===== 查询 =====

/** 分页（§三#1）：query 全可选 miId/configType(精确)/configName(模糊)/page=1/size=10；
 *  后端固定排序 miId→configType→configName 升序，仅正常记录，前端无需再排 */
export function getMiConfigPage(params: {
  miId?: number;
  configType?: string;
  configName?: string;
  page?: number;
  size?: number;
}): Promise<IPage<MiConfigVO>> {
  return bizRequest<IPage<MiConfigVO>>('/api/mi-config/page', { method: 'GET', params });
}

/** 详情（命中软删行 → 500「配置不存在，id=x」） */
export function getMiConfigDetail(id: number): Promise<MiConfigVO> {
  return bizRequest<MiConfigVO>(`/api/mi-config/detail/${id}`);
}

/**
 * 消费端点（§三#3/§6.3）：业务模块读配置统一入口
 * - 未配置 → 200 + null body = 正常分支，返回 null（调用方走默认值），封装层不抛错
 * - configType 缺省=default；configName 缺省=''键（类型级默认配置）
 * - miId 必填（缺 → 500「机构ID不能为空」）
 */
export function getMiConfigValue(params: {
  miId: number;
  configType?: string;
  configName?: string;
}): Promise<MiConfigVO | null> {
  return bizRequest<MiConfigVO | null>('/api/mi-config/value', { method: 'GET', params });
}

// ===== 写操作 =====

/** 新增（§三#4）：命中在用行 → 500「该配置项已存在：{type} / {name}」（空名键时尾部有 "/ " 尾巴，
 *  前端提交前预检先行拦截，见弹窗 submit） */
export function createMiConfig(data: MiConfigSaveDTO): Promise<{ id: number; message: string }> {
  return bizRequest('/api/mi-config', {
    method: 'POST',
    data: cleanPayload(data, { keepEmpty: ['configValue'] }),
  });
}

/** 修改（§三#5/§6.2）：仅 configValue/remark 生效；configValue ""=清空（keepEmpty 直传）；null=不改 */
export function updateMiConfig(data: {
  id: number;
  configValue?: string;
  remark?: string;
}): Promise<{ message: string }> {
  return bizRequest('/api/mi-config', {
    method: 'PUT',
    data: cleanPayload(data, { keepEmpty: ['configValue'] }),
  });
}

/** 删除（软删，§6.1）：同键重建将复活原行（id 不变、create_time 保留）；文案由调用方按复活语义撰写 */
export function deleteMiConfig(id: number): Promise<{ message: string }> {
  return bizRequest(`/api/mi-config/delete/${id}`, { method: 'DELETE' });
}
