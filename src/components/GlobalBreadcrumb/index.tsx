// src/components/GlobalBreadcrumb/index.tsx
import { history, useLocation } from '@umijs/max';
import { Breadcrumb } from 'antd';
import { findMenuNode } from '@/config/routes';

export default function GlobalBreadcrumb() {
  const { pathname } = useLocation();
  const current = findMenuNode(pathname)?.name;

  const items = [
    { title: '首页', onClick: () => history.push('/welcome') },
    ...(current ? [{ title: current }] : []),
  ];

  return (
    <div style={{ padding: '0 16px' }}>
      <Breadcrumb items={items} />
    </div>
  );
}
