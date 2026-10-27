// src/hooks/useDict.ts
import { useCallback } from 'react';
import {
  type DictOptionVO,
  getDictOptions,
  getDictOptionsBatch,
} from '@/services/dict';

const TTL = 30 * 60 * 1000; // 30min
type Entry = { data: DictOptionVO[]; ts: number };

// 模块级缓存（单租户场景 key 不含 miId；未来多机构切换需把 miId 并入 key）
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<DictOptionVO[]>>();

function logErr(scope: string, e: unknown) {
  console.error(`[useDict:${scope}]`, e); // 错误必现，禁止静默吞错
}

export function useDict() {
  /** 取单个字典（带缓存）；同一页面多字典请用 preload */
  const getOptions = useCallback(
    (dictCode: string): Promise<DictOptionVO[]> => {
      const hit = cache.get(dictCode);
      if (hit && Date.now() - hit.ts < TTL) return Promise.resolve(hit.data);
      const p =
        inflight.get(dictCode) ??
        getDictOptions({ dictCode })
          .then((list) => {
            cache.set(dictCode, { data: list, ts: Date.now() });
            return list;
          })
          .catch((e) => {
            logErr('options', e);
            throw e;
          })
          .finally(() => inflight.delete(dictCode));
      inflight.set(dictCode, p);
      return p;
    },
    [],
  );

  /** 一页多字典必须 batch，禁止发 N 个 options 请求 */
  const preload = useCallback(async (dictCodes: string[]) => {
    const need = dictCodes.filter((c) => c && !cache.has(c));
    if (!need.length) return;
    try {
      const map = await getDictOptionsBatch({ dictCodes: need });
      const now = Date.now();
      need.forEach((c) => {
        cache.set(c, { data: map[c] ?? [], ts: now });
      });
    } catch (e) {
      logErr('batch', e);
    }
  }, []);

  /** 远端搜索（DictSelect remote 模式）：永远走网络，绕过缓存 */
  const search = useCallback(
    (dictCode: string, keyword: string) =>
      getDictOptions({ dictCode, keyword }),
    [],
  );

  /** 管理页写操作成功后调用 */
  const invalidate = useCallback((dictCode: string) => {
    cache.delete(dictCode);
  }, []);
  const invalidateAll = useCallback(() => {
    cache.clear();
  }, []);

  return { getOptions, preload, search, invalidate, invalidateAll };
}
