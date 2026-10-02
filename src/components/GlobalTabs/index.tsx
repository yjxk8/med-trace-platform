// src/components/GlobalTabs/index.tsx

import * as AntIcons from '@ant-design/icons';
import { history, useLocation } from '@umijs/max';
import { ConfigProvider, Tabs } from 'antd';
import { useEffect, useState } from 'react';
import { findMenuNode } from '@/config/routes';

export interface TabItem {
  key: string;
  label: string;
  icon?: string; // 路由表里的图标名，原样持久化
}

const HOME_PATH = '/welcome';
const HOME_TAB: TabItem = {
  key: HOME_PATH,
  label: '首页',
  icon: 'HomeOutlined',
};
const STORAGE_KEY = 'global-tabs-v2';

export { STORAGE_KEY as TABS_STORAGE_KEY }; // ← 新增：供 app.tsx 退出登录时清理页签

/** 图标名 → 组件（兼容 HomeOutlined / home / Home 三种写法） */
const resolveIcon = (name?: string): any => {
  if (!name) return null;
  const lib = AntIcons as any;
  if (lib[name]) return lib[name];
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  const full = /Outlined$|Filled$|TwoTone$/.test(cap) ? cap : `${cap}Outlined`;
  return lib[full] || null;
};

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
        if (!label) continue; // 菜单表查不到 → 丢弃脏页签
        seen.add(t.key);
        valid.push({
          key: t.key,
          label,
          icon: t.icon ?? findMenuNode(t.key)?.icon,
        });
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

  useEffect(() => {
    if (isLoginPage) return;
    const label = labelOf(pathname);
    if (!label) return; // 无名路径不登记
    setTabs((prev) => {
      if (prev.some((t) => t.key === pathname)) return prev;
      const next = [
        ...prev,
        { key: pathname, label, icon: findMenuNode(pathname)?.icon },
      ];
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
    <ConfigProvider
      theme={{
        components: {
          Tabs: {
            cardGutter: 8, // 页签之间的间隙
            horizontalMargin: '0', // ← 新增：去掉页签导航条默认的 16px 下边距
            horizontalItemPadding: '8px 16px',
            horizontalItemPaddingRTL: '8px 16px',
            itemColor: 'rgba(0,0,0,0.65)',
            itemHoverColor: '#1677ff',
            itemSelectedColor: '#1677ff', // 激活页签：文字+图标变蓝
            cardBg: '#ffffff',
          },
        },
      }}
    >
      <div
        className="global-tabs"
        style={{
          background: '#f5f7fa',
          padding: '8px 16px 0',
          borderTop: '1px solid #f0f0f0',
          flexShrink: 0,
        }}
      >
        <style>{`.global-tabs .ant-tabs-nav{margin-bottom:0!important}`}</style>
        <Tabs
          type="editable-card"
          hideAdd
          activeKey={pathname}
          onChange={(key) => history.push(key)}
          onEdit={(targetKey, action) => {
            if (action === 'remove') handleRemove(targetKey as string);
          }}
          items={tabs.map((t) => {
            const Icon = resolveIcon(t.icon);
            return {
              key: t.key,
              closable: t.key !== HOME_PATH,
              label: (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {Icon && <Icon />}
                  {t.label}
                </span>
              ),
            };
          })}
        />
      </div>
    </ConfigProvider>
  );
};

export default GlobalTabs;
