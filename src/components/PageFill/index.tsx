// src/components/PageFill/index.tsx
import type { ReactNode } from 'react';

/**
 * 页面骨架：占满内容宿主剩余高度。
 * - 默认 overflow: hidden，配合 FillTable 实现「表体内部滚动、分页固定」
 * - 内容天然较长的页面（如 Welcome）传 scrollable，让其内部滚动
 */
const PageFill: React.FC<{ scrollable?: boolean; children: ReactNode }> = ({
  scrollable,
  children,
}) => (
  <div
    style={{
      flex: 1,
      minHeight: 0,
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 12, // 卡片间距统一 12，紧凑
      overflowY: scrollable ? 'auto' : 'hidden',
    }}
  >
    {children}
  </div>
);

export default PageFill;
