/**
 * 当前机构上下文(★A8 → localStorage 持久化 → 本轮升级为响应式单一事实源)
 * 原因:登录/选机构走整页刷新(window.location.replace),内存态会被清空。
 * 拦截器每次请求读 localStorage,刷新后自动恢复,getInitialState 无需还原。
 * 语义:setOrgId(0)=平台级不注入 X-Org-Id(§8:该头仅审计透传,可选)。
 * 本轮新增:
 * - setOrgId/clearOrgId 变更时分发 ORG_CHANGE_EVENT,页面可订阅响应(顶栏软提示等场景);
 * - useOrgId():事件驱动 + 跨标签页 storage 同步的响应式读取,页面用它在切机构后自动重查。
 */
import { useEffect, useState } from 'react';

const ORG_ID_KEY = 'orgId';
const ORG_CHANGE_EVENT = 'org-context-changed';

function normalize(raw: string | null): number | null {
  return raw != null && Number(raw) > 0 ? Number(raw) : null; // 0/空 = 平台级未选,null
}

export function setOrgId(id: number | string | null | undefined): void {
  if (id != null && String(id) !== '0')
    localStorage.setItem(ORG_ID_KEY, String(id));
  else localStorage.removeItem(ORG_ID_KEY);
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(ORG_CHANGE_EVENT));
}

export function getOrgId(): string | null {
  try {
    return localStorage.getItem(ORG_ID_KEY);
  } catch {
    return null;
  }
}

export function clearOrgId(): void {
  try {
    localStorage.removeItem(ORG_ID_KEY);
  } catch {
    /* 忽略 */
  }
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(ORG_CHANGE_EVENT));
}

/** 响应式读取当前机构(事件驱动 + 跨标签 storage 同步);平台级/未选机构 → null */
export function useOrgId(): number | null {
  const [v, setV] = useState<number | null>(() => normalize(getOrgId()));
  useEffect(() => {
    const l = () => setV(normalize(getOrgId()));
    window.addEventListener(ORG_CHANGE_EVENT, l as EventListener);
    window.addEventListener('storage', l as EventListener);
    return () => {
      window.removeEventListener(ORG_CHANGE_EVENT, l as EventListener);
      window.removeEventListener('storage', l as EventListener);
    };
  }, []);
  return v;
}
