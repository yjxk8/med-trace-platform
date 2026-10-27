/**
 * 数据字典 services —— /dict 端点（范式对齐 drugTransfer.ts）
 * ⚠️ miId 租户铁律：后端所有入口必传（DictServiceImpl.typePage:138 实测：
 *    缺失 → 500「机构ID（miId）不能为空」），统一在本服务层注入，
 *    getMiId 取自租户上下文 @/services/tenant（与 drugTransfer 同源，页面零改动）
 * ⚠️ 业务错误 HTTP 500 + {code,message}（无 200 包裹层）→ 拦截器统一 toast；
 *    页面 catch 兜底 message.error（对齐 drugStock 页范式）
 * ⚠️ 值域代码 dictValue / 含义 dictLabel 为字符串语义，禁止数值化
 */
import { bizRequest } from '@/services/auth';
import { getMiId, getMiIdRequired } from '@/services/tenant';
import type { IPage } from '@/utils/types';

/** Dict 页 fail-fast 阻断态需要读取 miId，转发租户上下文实现，避免二次实现 */
export { getMiId } from '@/services/tenant';

// ==================== 类型（VO 完整字段名以联调实测为准回填） ====================

/** 下拉项（/dict/options）；label/value 字段名双形态防御归一化 */
export type DictOptionVO = { label: string; value: string };

/** 字典类型行 */
export type DictTypeVO = {
  id: number;
  dictCode: string;
  dictName: string;
  /** 分组：0/1=国标/行标【待确认】、2=院内、3=平台；字段名【待确认：type or scope】 */
  type: string;
  miId: number;
  /** '0' 启用 / '1' 停用（类型口径未定，统一 String 归一化比较） */
  status: string;
  remark?: string | null;
  createTime?: string;
};

/** 字典数据行 */
export type DictDataVO = {
  id: number;
  dictCode: string;
  miId: number;
  dictLabel: string; // 含义（真实系统列名 code）
  dictValue: string; // 值域代码
  dictSort?: number | null;
  pinyin?: string | null; // 拼音首字母；不传由后端按 label 自动生成
  status: string;
  createTime?: string;
};

/** 分组常量（与 dict_type.type 枚举同源；0/1 待确认后回填） */
export const DICT_SCOPE = { HOSPITAL: '2', PLATFORM: '3' } as const;

/** VO 字段防御归一化（label/dictLabel、value/dictValue 二选一命中） */
const norm = (o: Record<string, unknown>): DictOptionVO => ({
  label: (o.label ?? o.dictLabel) as string,
  value: (o.value ?? o.dictValue) as string,
  ...o,
});

// ==================== 业务侧：下拉数据源 ====================

/** 单字典下拉；keyword 支持中文模糊 + 拼音首字母 */
export async function getDictOptions(params: {
  dictCode: string;
  keyword?: string;
}): Promise<DictOptionVO[]> {
  const res = await bizRequest<DictOptionVO[]>('/api/dict/options', {
    method: 'GET',
    params: { ...params, miId: getMiId() },
  });
  return (res ?? []).map(norm);
}

/** 多字典批量（≤20 个）；不存在的 key 返回空数组不报错 */
export async function getDictOptionsBatch(params: {
  dictCodes: string[];
}): Promise<Record<string, DictOptionVO[]>> {
  const res = await bizRequest<Record<string, DictOptionVO[]>>(
    '/api/dict/options/batch',
    {
      method: 'GET',
      params: { dictCodes: params.dictCodes.join(','), miId: getMiId() },
    },
  );
  return res ?? {};
}

// ==================== 字典类型管理 ====================

/** 类型分页（miId 后端强校验实测 500；scope=平台∪本院 由后端按 miId 合并） */
export async function pageDictType(params: {
  page?: number;
  size?: number;
  keyword?: string;
}): Promise<IPage<DictTypeVO>> {
  return bizRequest<IPage<DictTypeVO>>('/api/dict/type/page', {
    method: 'GET',
    params: { ...params, miId: getMiId() },
  });
}

/** 数据管理页的类型选择器 */
export async function getDictTypeOptions(): Promise<DictOptionVO[]> {
  const res = await bizRequest<DictOptionVO[]>('/api/dict/type/options', {
    method: 'GET',
    params: { miId: getMiId() },
  });
  return (res ?? []).map(norm);
}

/** 新增；type=2（院内）必传 miId（缺失 fail-fast）；type=3（平台）不传，后端强制落 -1 */
export function createDictType(data: {
  dictCode: string;
  dictName: string;
  type: string;
  remark?: string;
}): Promise<{ id: number; message: string }> {
  if (data.type === DICT_SCOPE.HOSPITAL) {
    const miId = getMiIdRequired();
    return bizRequest('/api/dict/type', { method: 'POST', data: { ...data, miId } });
  }
  return bizRequest('/api/dict/type', { method: 'POST', data });
}

/** 修改（id 必传）；⚠️ dictCode/type/status 后端锁定（传了也被忽略）；
 *  miId 随 drugTransfer 惯例携带，满足后端入口级校验 */
export function updateDictType(data: {
  id: number;
  dictName?: string;
  remark?: string;
}): Promise<{ message: string }> {
  return bizRequest('/api/dict/type', {
    method: 'PUT',
    data: { ...data, miId: getMiId() },
  });
}

/** 启停（status 必传：0 启用 / 1 停用），miId 随 params 携带 */
export function setDictTypeStatus(
  id: number,
  status: 0 | 1,
): Promise<{ message: string }> {
  return bizRequest(`/api/dict/type/${id}/status`, {
    method: 'PUT',
    params: { status, miId: getMiId() },
  });
}

/** 删除；类型下有字典项 → 500「请先删除字典项」（后端数据保护，toast 原文勿截断） */
export function deleteDictType(id: number): Promise<{ message: string }> {
  return bizRequest(`/api/dict/type/${id}`, {
    method: 'DELETE',
    params: { miId: getMiId() },
  });
}

// ==================== 字典数据管理 ====================

/** 字典项分页；keyword 后端命中 label/pinyin */
export async function pageDictData(params: {
  page?: number;
  size?: number;
  dictCode?: string;
  keyword?: string;
}): Promise<IPage<DictDataVO>> {
  return bizRequest<IPage<DictDataVO>>('/api/dict/data/page', {
    method: 'GET',
    params: { ...params, miId: getMiId() },
  });
}

/** 新增（miId 必传铁律，缺失 fail-fast）；同范围 value 重复 → 500 原文 toast */
export function createDictData(data: {
  dictCode: string;
  dictLabel: string;
  dictValue: string;
  dictSort?: number;
  pinyin?: string;
}): Promise<{ id: number; message: string }> {
  const miId = getMiIdRequired();
  return bizRequest('/api/dict/data', { method: 'POST', data: { miId, ...data } });
}

/** 修改；dictCode/miId/status 锁定；不传 pinyin → 后端按新 label 自动重算 */
export function updateDictData(data: {
  id: number;
  dictLabel?: string;
  dictValue?: string;
  dictSort?: number;
  pinyin?: string;
}): Promise<{ message: string }> {
  return bizRequest('/api/dict/data', {
    method: 'PUT',
    data: { ...data, miId: getMiId() },
  });
}

/** 启停（status 必传：0 启用 / 1 停用） */
export function setDictDataStatus(
  id: number,
  status: 0 | 1,
): Promise<{ message: string }> {
  return bizRequest(`/api/dict/data/${id}/status`, {
    method: 'PUT',
    params: { status, miId: getMiId() },
  });
}

/** ⚠️ 物理删除（无软删）；历史引用场景应停用而非删除，调用方必须二次确认 */
export function deleteDictData(id: number): Promise<{ message: string }> {
  return bizRequest(`/api/dict/data/${id}`, {
    method: 'DELETE',
    params: { miId: getMiId() },
  });
}

// ==================== 运维（管理员） ====================

/** 仅 DB 直改数据后需要；正常走接口写操作后端已自动失效。miId 随 params 防御性携带 */
export function refreshDictCache(): Promise<{
  message: string;
  cleared: number;
}> {
  return bizRequest('/api/dict/cache/refresh', {
    method: 'POST',
    params: { miId: getMiId() },
  });
}
