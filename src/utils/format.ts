// src/utils/format.ts —— 数字/日期格式化唯一来源（R5）
import dayjs from 'dayjs';

const numberFormatter = new Intl.NumberFormat('en-US');

/** 千分位 */
export const formatNumber = (val: number | string): string => {
  const parsed = Number(val);
  return Number.isFinite(parsed) ? numberFormatter.format(parsed) : '';
};

/** 金额（元） */
export const formatYuan = (val: number | string) => `¥ ${formatNumber(val)}`;

// ===== 日期（R5 唯一来源；services/user.ts 仅 re-export 兼容旧引用，页面新代码从这里引）=====
export const FMT_DATE = 'YYYY-MM-DD';
export const FMT_DATETIME = 'YYYY-MM-DD HH:mm:ss';

/** datetime → 'YYYY-MM-DD HH:mm:ss'；空值 '-'（各页面 shared.tsx 的本地 fmtFull 后续统一切到这里） */
export const fmtDateTime = (v?: string | null) =>
  v ? dayjs(v).format(FMT_DATETIME) : '-';

/** date → 'YYYY-MM-DD'；空值 '-' */
export const fmtDate = (v?: string | null) =>
  v ? dayjs(v).format(FMT_DATE) : '-';
