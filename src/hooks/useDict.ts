/**
 * 字典业务公共层（P0 ·《关键点.md》§7 落地 · 合并升级版）
 * ★硬性规则（全项目遵守）：
 * - 业务页面禁止直接 import '@/services/dict' 调接口——一律经本层或 <DictSelect>
 *   （公共组件内部引 services 属公共层内部实现，允许）
 * - 列表页翻译只允许 batchTranslate/translateMap（一次拉全量+本地匹配），
 *   禁止表格 formatter 逐行调 /translate（N+1，坑#9）
 * - DictItemVO 契约字段：{ label, value, cssClass, sort, pinyin, platform }；
 *   旧 DictOptionVO 仅作 services 兼容别名，新代码禁止引用
 *
 * 本轮合并升级（现网导出全保留，DictSelect 使用的 getDict 模块级导出不变）：
 * + loadDict（提示词定版别名 ≡ getDict）
 * + batchTranslate(dictCode, values?)：{value:label}；values 缺省=全量（列表页标准姿势）
 * + refreshDictCache()：POST /api/dict/cache/refresh + 清本地（管理员运维，两件事必须同做）
 * + searchOptions()：转发 services.getDictOptions（带 keyword 远程搜索，DictSelect remote 用；
 *   ⚠️ 与 hook 内 getDictOptions 别名（=getDict 全量）不同源，远程搜索一律走 searchOptions）
 * ~ clearDictLocalCache(dictCode?)：支持定向清理（无参=全量，向后兼容）
 */
import { useMemo } from 'react';
import {
  type DictItemVO,
  getDictOptions as getDictOptionsApi,
  getDictOptionsBatch,
  getTypeItems,
  refreshDictCache as refreshDictCacheApi,
} from '@/services/dict';

/** 模块级缓存：dictCode → Promise<DictItemVO[]>；Promise 复用 = 请求去重 */
const cache = new Map<string, Promise<DictItemVO[]>>();

/** 单字典全量（缓存命中零网络）；失败清缓存允许下次重试 */
export function getDict(dictCode: string): Promise<DictItemVO[]> {
  const key = String(dictCode ?? '').trim();
  if (!key) return Promise.resolve([]);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = getTypeItems(key).catch((e) => {
    console.warn('[useDict] 字典加载失败:', key, (e as Error)?.message ?? e);
    cache.delete(key);
    return [] as DictItemVO[];
  });
  cache.set(key, p);
  return p;
}

/** 提示词定版别名：loadDict(dictType) ≡ getDict(dictCode) */
export const loadDict = getDict;

/** 值→显示名 Map（列表翻译姿势之一；一次拉全量，禁止逐行 /translate —— 坑#9） */
export async function translateMap(
  dictCode: string,
): Promise<Map<string, string>> {
  const items = await getDict(dictCode);
  return new Map(items.map((i) => [String(i.value), i.label]));
}

/**
 * ★批量翻译（列表页统一入口）：{ value: label } 对象形态
 * - values 缺省/空数组 → 全量映射（渲染同步匹配，一次请求）
 * - 传 values → 仅译给定值（详情回显）；内部仍是 loadDict 一次全量 + 本地匹配
 * - 未命中回原 value（与后端 /translate 兜底口径一致；历史自由文本原样回显）
 */
export async function batchTranslate(
  dictCode: string,
  values?: (string | number | null | undefined)[],
): Promise<Record<string, string>> {
  const m = await translateMap(dictCode);
  const out: Record<string, string> = {};
  if (values == null || values.length === 0) {
    m.forEach((label, key) => {
      out[key] = label;
    });
    return out;
  }
  values
    .filter((v) => v != null && v !== '')
    .forEach((v) => {
      const key = String(v);
      out[key] = m.get(key) ?? key;
    });
  return out;
}

/** 批量多字典（≤50 自动分片走 /options-batch；单分片失败不影响其余） */
export async function getDictBatch(
  dictCodes: string[],
): Promise<Record<string, DictItemVO[]>> {
  const uniq = [...new Set((dictCodes ?? []).filter(Boolean).map(String))];
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 50) chunks.push(uniq.slice(i, i + 50));
  const out: Record<string, DictItemVO[]> = {};
  await Promise.all(
    chunks.map(async (codes) => {
      try {
        const part = await getDictOptionsBatch({ dictCodes: codes });
        Object.entries(part ?? {}).forEach(([k, v]) => {
          out[k] = v ?? [];
        });
      } catch (e) {
        console.warn('[useDict] 批量加载失败:', codes.join(','), e);
      }
    }),
  );
  return out;
}

/** 单值直译（本地 Map 优先零网络；未命中回原 value，与后端 /translate 语义一致） */
export async function translate(
  dictCode: string,
  value?: string | null,
): Promise<string> {
  if (value == null || value === '') return '';
  const m = await translateMap(dictCode);
  return m.get(String(value)) ?? String(value);
}

/** ★远程混搜（remote 下拉用；中文命中 label/字母命中 pinyin，服务端过滤）——转发 services */
export function searchOptions(params: { dictCode: string; keyword?: string }) {
  return getDictOptionsApi(params);
}

/** 失效单字典缓存（管理页写操作后调用；下次 getDict 自动重拉） */
export function invalidateDict(dictCode: string) {
  cache.delete(String(dictCode ?? '').trim());
}

/**
 * 清本地缓存：传 dictCode 定向清理；缺省全量清理
 * （★签名升级：无参调用行为不变，现网调用面兼容）
 */
export function clearDictLocalCache(dictCode?: string) {
  const key = String(dictCode ?? '').trim();
  if (key) cache.delete(key);
  else cache.clear();
}

/** ★管理员运维：后端缓存刷新 + 本地全量清理（只调后端不清本地 → 业务页继续旧数据） */
export async function refreshDictCache(): Promise<{
  message: string;
  cleared: number;
}> {
  const res = await refreshDictCacheApi();
  cache.clear();
  return res;
}

/**
 * useDict —— 薄 hook（方法为模块级纯函数，引用恒稳定）
 * 别名转发保持既有调用面：invalidate / getDictOptions(=全量) / getDictOptionsBatch
 */
export function useDict() {
  return useMemo(
    () => ({
      getDict,
      loadDict,
      translateMap,
      batchTranslate,
      translate,
      getDictBatch,
      searchOptions,
      refreshDictCache,
      invalidate: invalidateDict,
      clearDictLocalCache,
      getDictOptions: getDict, // 全量别名（注意：远程搜索用 searchOptions）
      getDictOptionsBatch: getDictBatch,
    }),
    [],
  );
}
