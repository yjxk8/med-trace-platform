/**
 * 数据字典 services —— 后端定稿契约（《关键点.md》v1.0 · 13 接口全对齐）
 *
 * ★坑#2（/api 双前缀 —— 上次联调 404 的根因排查入口）：
 * - 后端字典模块路径是字面 /api/dict/**（与项目其他模块 /user、/mi 无 /api 前缀不同！）；
 * - 若 dev 代理对 ^/api 做了剥离重写，本文件请求到达后端会变成 /dict/** → 404
 *   （现象即后端返回「接口不存在: GET /dict/type/page」）；修复方案见文末交付说明（推荐改代理，零前端改动）。
 *
 * ⚠️ miId 租户铁律：管理分页接口 miId 必填（缺参 400「机构ID（miId）不能为空」），本层统一注入；
 *   平台管理员 miId 口径（-1/null）后端待确认（文档待解决#1），确认前按登录态原样携带。
 * ⚠️ 坑#3：启停 URL 入参 status 为数字(0|1)，VO 出参为字符串('0'|'1'，DB char(1))——
 *   本层入参固定 0|1 数字；页面展示统一走 shared.isOn(String 归一化)。
 * ⚠️ dictValue(值域代码)/dictLabel(显示名)为字符串语义，禁止数值化。
 * ⚠️ 坑#11：可选筛选不传优于传空串（后端按 hasText 判断），分页查询本层统一归一化。
 */
import { bizRequest } from '@/services/auth';
import { getMiId, getMiIdRequired } from '@/services/tenant';
import type { IPage } from '@/utils/types';

/** IPage 分页结构 {records,total,size,current,pages}（坑#8：禁止按 {list,total} 解析）与工程 @/utils/types 同源 */
export type { IPage } from '@/utils/types';

/** Dict 页 fail-fast 阻断态读取 miId 用，转发租户上下文实现 */
export { getMiId } from '@/services/tenant';

// ==================== 业务错误码（文档 §6.6；页面差异化处理） ====================
export const DICT_ERR = {
  /** 类型不存在（含"新增数据项选平台类型"操作指引文案，直接透传后端 message） */
  TYPE_NOT_EXIST: 4601,
  /** 类型编码重复 → 表单 dictCode 内联标红 */
  TYPE_CODE_DUP: 4602,
  /** 类型下存在字典项不可删 → toast 引导先删字典项 */
  TYPE_HAS_ITEMS: 4603,
  /** 字典项不存在（通常并发删除）→ toast 后刷新列表 */
  DATA_NOT_EXIST: 4604,
  /** 字典项重复（同类型+机构+值）→ 表单 dictValue 内联标红 */
  DATA_VALUE_DUP: 4605,
  /** 登录态无法解析机构 → 同 401（拦截器统一跳转） */
  LOGIN_ABNORMAL: 4606,
} as const;

/** 从 bizRequest reject 的错误对象提取业务 code（拦截器需携带 err.code，见文末说明） */
export function getBizCode(e: unknown): number | undefined {
  const c = (e as { code?: unknown } | null | undefined)?.code;
  if (typeof c === 'number') return c;
  if (typeof c === 'string' && /^\d+$/.test(c)) return Number(c);
  return undefined;
}

// ==================== 可选参数归一化（坑#11） ====================
/** 空串/空白 → undefined（axios 序列化时跳过 undefined，等效"不传"） */
const cleanOpt = (v?: string) => {
  const t = (v ?? '').trim();
  return t ? t : undefined;
};

// ==================== 类型定义（文档 §6.1 先定义后使用） ====================

/** 业务下拉项（唯一结构，四业务口共用；后端已按 sort 升序返回，前端免排） */
export type DictItemVO = {
  label: string;
  /** 字典值 = 业务表唯一允许存储的字段（坑#9 翻译 Map 的 key） */
  value: string;
  cssClass?: string | null;
  sort?: number;
  pinyin?: string;
  /** true = 平台级（miId===-1 派生只读）：打"标准"徽标、编辑/删除禁用、禁止直接新增本院项 */
  platform?: boolean;
};

/** 字典类型行 */
export type DictTypeVO = {
  id: number;
  dictName: string;
  /** 业务引用键，创建后锁定（编辑态 disabled；PUT 传了被后端忽略） */
  dictCode: string;
  /** '0' 实体 / '1' 映射（文档 §6.2 定稿；新增默认 '0'，一般不暴露给用户改） */
  dictType: '0' | '1';
  /** 来源：'1'国标 '2'院内 '3'平台 '4'行标；type=2 联动 miId 必填 */
  type: '1' | '2' | '3' | '4';
  /** 发布机构（-1=平台级；type≠2 后端强制归 -1） */
  miId: number;
  status: '0' | '1';
  remark?: string;
  createTime: string;
  updateTime: string;
  platform?: boolean;
};

/** 字典数据行；唯一键 (dict_code, mi_id, dict_value)；无软删，删除即物理删除 */
export type DictDataVO = {
  id: number;
  dictLabel: string;
  /** 拼音首字母；三态（坑#4）：''=按新 label 重算 / null·不传=保留旧值 / 值=手填 */
  pinyin?: string;
  dictValue: string;
  dictCode: string;
  miId: number;
  dictSort: number;
  status: '0' | '1';
  cssClass?: string | null;
  remark?: string;
  createTime: string;
  updateTime: string;
  platform?: boolean;
};

/** 分组常量（与 dict_type.type 枚举同源，文档定稿） */
export const DICT_SCOPE = { HOSPITAL: '2', PLATFORM: '3' } as const;

/** VO 字段防御归一化（label/value 双字段名命中） */
const norm = (o: Record<string, unknown>): DictItemVO => ({
  label: (o.label ?? o.dictLabel) as string,
  value: (o.value ?? o.dictValue) as string,
  ...o,
});

// ==================== 业务侧（前端下拉/翻译用，§2.2-A） ====================

/**
 * 业务下拉规范入口：GET /api/dict/type/{dictType}（启用项，sort 升序）。
 * ⚠️ 坑#1：dictCode 禁用保留词 page/options（会字面命中本管理路由被遮蔽）——前端表单已拦截
 */
export async function getTypeItems(dictCode: string): Promise<DictItemVO[]> {
  const res = await bizRequest<DictItemVO[]>(
    `/api/dict/type/${encodeURIComponent(String(dictCode ?? '').trim())}`,
    { method: 'GET' },
  );
  return (res ?? []).map(norm);
}

/** keyword 混搜下拉（中文命中 label，字母命中 pinyin，大小写不敏感）；DictSelect remote 模式数据源 */
export async function getDictOptions(params: {
  dictCode: string;
  keyword?: string;
}): Promise<DictOptionVO[]> {
  const res = await bizRequest<DictItemVO[]>('/api/dict/options', {
    method: 'GET',
    params: { dictCode: params.dictCode, keyword: cleanOpt(params.keyword), miId: getMiId() },
  });
  return (res ?? []).map(norm);
}

/**
 * 多字典一次拉取（页面初始化优化）；文档定稿 ≤50 个（空/超限后端 400）→
 * 前端按 50 自动分片并行合并，调用方无感
 */
export async function getDictOptionsBatch(params: {
  dictCodes: string[];
}): Promise<Record<string, DictOptionVO[]>> {
  const uniq = [...new Set((params.dictCodes ?? []).filter(Boolean).map(String))];
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 50) chunks.push(uniq.slice(i, i + 50));
  const out: Record<string, DictOptionVO[]> = {};
  await Promise.all(
    chunks.map(async (codes) => {
      const res = await bizRequest<Record<string, DictItemVO[]>>('/api/dict/options-batch', {
        method: 'GET',
        params: { dictCodes: codes.join(','), miId: getMiId() },
      });
      Object.entries(res ?? {}).forEach(([k, v]) => {
        out[k] = (v ?? []).map(norm);
      });
    }),
  );
  return out;
}

/**
 * 单值翻译兜底口；未命中/缺参返回 label:'' 或原 value，不报错。
 * ⚠️ 坑#9：列表页禁止循环调用本接口（N+1 请求爆炸）——用 useDict().translateMap 建本地 Map
 */
export async function translateDict(dictCode: string, value: string): Promise<string> {
  const res = await bizRequest<{ label: string }>('/api/dict/translate', {
    method: 'GET',
    params: { dictType: dictCode, value },
  });
  return res?.label || String(value ?? '');
}

/** 业务侧下拉项类型（别名导出保持既有调用面） */
export type DictOptionVO = { label: string; value: string };

// ==================== 字典类型管理（§2.2-B） ====================

/** 类型分页；范围=平台∪本院（后端按 miId 合并，平台行混排）；keyword 命中 dictName/dictCode */
export async function pageDictType(params: {
  page?: number;
  size?: number;
  /** '0' 实体 / '1' 映射筛选（契约保留） */
  dictType?: string;
  type?: string;
  status?: string;
  keyword?: string;
}): Promise<IPage<DictTypeVO>> {
  return bizRequest<IPage<DictTypeVO>>('/api/dict/type/page', {
    method: 'GET',
    params: {
      miId: getMiId(),
      dictType: cleanOpt(params.dictType),
      type: cleanOpt(params.type),
      status: cleanOpt(params.status),
      keyword: cleanOpt(params.keyword),
      page: params.page,
      size: params.size,
    },
  });
}

/** 类型下拉（数据管理页/弹窗选择器数据源，仅启用）；value=dictCode、label=dictName */
export async function getDictTypeOptions(): Promise<DictItemVO[]> {
  const res = await bizRequest<DictItemVO[]>('/api/dict/type/options', {
    method: 'GET',
    params: { miId: getMiId() },
  });
  return (res ?? []).map(norm);
}

/**
 * 新增类型；type=2（院内）必传 miId（本层 getMiIdRequired fail-fast）；
 * type≠2 → 后端强制归 -1：前端不携带 miId（文档 §6.1）；dictType 兜底 '0'（文档 §6.2）
 */
export function createDictType(data: {
  dictCode: string;
  dictName: string;
  dictType?: string;
  type: string;
  miId?: number;
  remark?: string;
}): Promise<{ id: number; message: string }> {
  const payload = { ...data, dictType: data.dictType ?? '0' };
  if (data.type === DICT_SCOPE.HOSPITAL) {
    payload.miId = getMiIdRequired();
  } else {
    delete payload.miId;
  }
  return bizRequest('/api/dict/type', { method: 'POST', data: payload });
}

/**
 * 修改类型（id 必传）；⚠️ dictCode/miId/status 传了被后端忽略（坑#6 三态锁定）；
 * type/dictType/remark 可改；编辑态不传 dictType → 后端保留原值（前端不暴露该字段）
 */
export function updateDictType(data: {
  id: number;
  dictName?: string;
  type?: string;
  remark?: string;
}): Promise<{ message: string }> {
  return bizRequest('/api/dict/type', { method: 'PUT', data: { ...data, miId: getMiId() } });
}

/** 启停类型（status 必传，坑#3：数字 0|1）；停用后业务侧下拉即时消失 */
export function setDictTypeStatus(id: number, status: 0 | 1): Promise<{ message: string }> {
  return bizRequest(`/api/dict/type/${id}/status`, {
    method: 'PUT',
    params: { status, miId: getMiId() },
  });
}

/** 删除类型；类型下有字典项 → 4603（后端数据保护） */
export function deleteDictType(id: number): Promise<{ message: string }> {
  return bizRequest(`/api/dict/type/${id}`, { method: 'DELETE', params: { miId: getMiId() } });
}

// ==================== 字典数据管理（§2.2-B） ====================

/** 数据分页；范围=平台∪本院；keyword 命中 dictLabel/pinyin */
export async function pageDictData(params: {
  page?: number;
  size?: number;
  dictCode?: string;
  status?: string;
  keyword?: string;
}): Promise<IPage<DictDataVO>> {
  return bizRequest<IPage<DictDataVO>>('/api/dict/data/page', {
    method: 'GET',
    params: {
      miId: getMiId(),
      dictCode: cleanOpt(params.dictCode),
      status: cleanOpt(params.status),
      keyword: cleanOpt(params.keyword),
      page: params.page,
      size: params.size,
    },
  });
}

/**
 * 新增数据项（miId 必填铁律；pinyin 留空后端自动生成）；
 * 唯一键 (dict_code, mi_id, dict_value) → 同范围 value 重复 4605；
 * ⚠️ 父类型必须同 miId 范围（平台类型下直接加本院项 → 后端 4601 指引文案，前端已前置阻断）
 */
export function createDictData(data: {
  dictCode: string;
  dictLabel: string;
  dictValue: string;
  dictSort?: number;
  pinyin?: string;
  cssClass?: string;
  remark?: string;
}): Promise<{ id: number; message: string }> {
  return bizRequest('/api/dict/data', {
    method: 'POST',
    data: { miId: getMiIdRequired(), ...data },
  });
}

/**
 * 修改数据项（id 必传）；dictCode/miId/status 锁定（传了被忽略，坑#6）；
 * pinyin 三态（坑#4）：''=按新 label 重算 / 不传=保留旧值 / 值=手填 —— 页面按三态显式构造；
 * remark/cssClass 清空必须传 ''（传 null 无效，MyBatis-Plus 跳过 null，坑#4）
 * ⚠️ dictSort 字段【待核对：文档标注 DTO 是否含此字段】，多余字段后端忽略不报错
 */
export function updateDictData(data: {
  id: number;
  dictLabel?: string;
  dictValue?: string;
  dictSort?: number;
  /** ''=按新 label 重算；不传=保留；值=手填（坑#4 三态，页面负责显式构造） */
  pinyin?: string;
  cssClass?: string;
  remark?: string;
}): Promise<{ message: string }> {
  return bizRequest('/api/dict/data', { method: 'PUT', data: { ...data, miId: getMiId() } });
}

/** 启停数据项（status 数字 0|1）；停用后业务下拉即时消失 */
export function setDictDataStatus(id: number, status: 0 | 1): Promise<{ message: string }> {
  return bizRequest(`/api/dict/data/${id}/status`, {
    method: 'PUT',
    params: { status, miId: getMiId() },
  });
}

/** ⚠️ 物理删除（无软删，唯一键不占用）；历史引用翻译缺失显示"-"，调用方必须二次确认并引导"停用优先" */
export function deleteDictData(id: number): Promise<{ message: string }> {
  return bizRequest(`/api/dict/data/${id}`, { method: 'DELETE', params: { miId: getMiId() } });
}

// ==================== 运维（§2.2-B；Redis 接入前 cleared 恒 0） ====================

/** 仅 DB 直改数据后需要；接口写操作后端已即时生效（文档坑#10：勿做延迟刷新/轮询，属过度设计） */
export function refreshDictCache(): Promise<{ message: string; cleared: number }> {
  return bizRequest('/api/dict/cache/refresh', { method: 'POST', params: { miId: getMiId() } });
}
