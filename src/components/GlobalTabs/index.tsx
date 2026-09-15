// src/components/GlobalTabs/index.tsx

import { history, useLocation } from '@umijs/max';
import { Tabs } from 'antd';
import { useEffect, useState } from 'react';
import { findMenuNode } from '@/config/routes';

export interface TabItem {
  key: string;
  label: string;
}
const HOME_PATH = '/welcome';
const HOME_TAB: TabItem = { key: HOME_PATH, label: '首页' };
const STORAGE_KEY = 'global-tabs-v2'; // ← 换 key：旧的脏数据直接作废

export { STORAGE_KEY as TABS_STORAGE_KEY }; // 新增这一行

/** 只认可「菜单表里查得到名字」的路径 */
const labelOf = (path: string): string | undefined => findMenuNode(path)?.name;

const loadTabs = (): TabItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as TabItem[]) : null;
    if (Array.isArray(parsed)) {
      const seen = new Set<string>();
      const valid: TabItem[] = [];
      for (const t of parsed) {
        if (!t || typeof t.key !== 'string' || seen.has(t.key)) continue;
        const label = labelOf(t.key);
        if (!label) continue; // 查不到名字 → 丢弃
        seen.add(t.key);
        valid.push({ key: t.key, label });
      }
      if (seen.has(HOME_PATH)) {
        return [
          valid.find((t) => t.key === HOME_PATH)!,
          ...valid.filter((t) => t.key !== HOME_PATH),
        ];
      }
    }
  } catch {
    /* ignore */
  }
  return [HOME_TAB];
};

const GlobalTabs: React.FC = () => {
  const location = useLocation();
  const [tabs, setTabs] = useState<TabItem[]>(loadTabs);
  const pathname = location.pathname;
  const isLoginPage = pathname.startsWith('/login');

  const persist = (next: TabItem[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // 路由变化 → 登记页签（无名路径如 "/" 一律不登记）
  useEffect(() => {
    if (isLoginPage) return;
    const label = labelOf(pathname);
    if (!label) return;
    setTabs((prev) => {
      if (prev.some((t) => t.key === pathname)) return prev;
      const next = [...prev, { key: pathname, label }];
      persist(next);
      return next;
    });
  }, [pathname, isLoginPage]);

  const handleRemove = (targetKey: string) => {
    const idx = tabs.findIndex((t) => t.key === targetKey);
    if (idx < 0 || targetKey === HOME_PATH) return;
    const next = tabs.filter((t) => t.key !== targetKey);
    const finalTabs = next.length ? next : [HOME_TAB];
    setTabs(finalTabs);
    persist(finalTabs);
    if (targetKey === pathname) {
      const neighbor = finalTabs[Math.min(idx, finalTabs.length - 1)];
      history.push(neighbor?.key || HOME_PATH);
    }
  };

  if (isLoginPage) return null;

  return (
    <div
      style={{
        background: '#fff',
        padding: '6px 16px 0',
        borderTop: '1px solid #f0f0f0',
        flexShrink: 0,
      }}
    >
      <Tabs
        type="editable-card"
        hideAdd
        size="small"
        activeKey={pathname}
        onChange={(key) => history.push(key)}
        onEdit={(targetKey, action) => {
          if (action === 'remove') handleRemove(targetKey as string);
        }}
        items={tabs.map((t) => ({
          key: t.key,
          label: t.label,
          closable: t.key !== HOME_PATH,
        }))}
      />
    </div>
  );
};
export default GlobalTabs;
