/**
 * 机构公共层（miId → 机构名称 翻译）—— 数据源：services/org/mi.getMiPage
 * 模式对齐 useDict：模块级 Promise 缓存 + 请求去重（StrictMode 双执行只发一次）；
 * 分页循环取全量（机构量级小：200/页 × 上限 50 页保护）
 * - getMiMap(): 全量 Map<id, MiVO>；失败清缓存允许下次重试
 * - miNameOf(map, miId): 同步翻译（-1=平台级；未命中/未加载兜底「机构 {miId}」，不抛错）
 * - useMiNames(): hook 形态——挂载拉全量，返回同步翻译函数，map 到位后自动重渲染
 * - invalidateMiMap(): 机构管理页写操作后调用，下次翻译自动重拉
 * ⚠️ 权限边界：/mi/page 若当前账号无权访问，静默失败 → 各消费处按兜底文案展示，不阻断字典页
 */
import { useEffect, useState } from 'react';
import { getMiPage, type MiVO } from '@/services/org/mi';

/** 全量拉取参数：200/页 × 上限 50 页（>10000 机构截断，正常量级远达不到） */
const FETCH_SIZE = 200;
const MAX_PAGES = 50;

/** 模块级缓存：全量机构 Map 的 Promise（Promise 复用 = 请求去重） */
let cachePromise: Promise<Map<number, MiVO>> | null = null;

export function getMiMap(): Promise<Map<number, MiVO>> {
  if (!cachePromise) {
    cachePromise = (async () => {
      const all: MiVO[] = [];
      const first = await getMiPage({ page: 1, size: FETCH_SIZE });
      all.push(...first.records);
      const pages = Number(first.pages ?? 1);
      for (let p = 2; p <= Math.min(pages, MAX_PAGES); p++) {
        const r = await getMiPage({ page: p, size: FETCH_SIZE });
        all.push(...r.records);
      }
      return new Map(all.map((m) => [m.id, m]));
    })().catch((e) => {
      cachePromise = null; // 失败清缓存，允许下次重试
      throw e;
    });
  }
  return cachePromise;
}

/** 同步翻译：-1=平台级；未命中/未加载兜底「机构 {miId}」；非法值 '-'（含停用机构，翻译场景不过滤状态） */
export function miNameOf(
  map: Map<number, MiVO> | null | undefined,
  miId?: number | string | null,
): string {
  const id = Number(miId);
  if (Number.isNaN(id)) return '-';
  if (id === -1) return '平台级';
  return map?.get(id)?.name || `机构 ${id}`;
}

/** 失效缓存（机构管理页新增/修改/删除后调用；下次 getMiMap 自动重拉） */
export function invalidateMiMap() {
  cachePromise = null;
}

/**
 * useMiNames —— 返回同步翻译函数 (miId) => 机构名；
 * 首次挂载触发全量拉取（模块级缓存，TypeModal/DataModal 等共享只发一次请求）
 */
export function useMiNames(): (miId?: number | string | null) => string {
  const [map, setMap] = useState<Map<number, MiVO> | null>(null);
  useEffect(() => {
    let alive = true;
    getMiMap()
      .then((m) => {
        if (alive) setMap(m);
      })
      .catch(() => {
        /* 静默：无权限/网络异常按兜底文案展示，不阻断字典页 */
      });
    return () => {
      alive = false;
    };
  }, []);
  return (miId) => miNameOf(map, miId);
}
