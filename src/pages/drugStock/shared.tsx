/**
 * 库存模块共享渲染工具（列表页 / 详情抽屉单一来源，防止两处渲染漂移）
 * 红线：
 * - dash() 只处理字符串，数字 0（currentInventory）禁止走它
 * - 临期/过期判定统一走 expiryDays/expiryFlag，30 天阈值只写这一处
 * - 长期(2099)判定统一走 isLongTerm：兼容 '2099-12-30' 与 '2099-12-30T00:00:00'
 *   两种格式（§2.4 示例 expiryDate 带 T，裸等值比较必漏判）
 */
import { Tag, Tooltip } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  type IsMedicineBox,
  LONG_TERM_EXPIRY,
  MEDICINE_BOX_MAP,
  NO_BATCH,
} from '@/services/inv/drugStock';

/** 筛选日期 → ISO 带 T（dayjs 用 [T] 转义字面量 T） */
export const fmtIso = (d: Dayjs) => d.format('YYYY-MM-DD[T]HH:mm:ss');

/** 库存表 datetime（2025-12-01T10:30:00）→ 日期 */
export const fmtDate = (v?: string | null) =>
  v ? dayjs(v).format('YYYY-MM-DD') : '-';

/** datetime → 日期时间；printTime 等可 null */
export const fmtFull = (v?: string | null) =>
  v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-';

/** 可空字符串 → '-'（只给字符串用） */
export const dash = (v?: string | null) =>
  v === null || v === undefined || v === '' ? '-' : v;

export function isLongTerm(v?: string | null): boolean {
  // 常量带 T 后缀，双方都取前 10 位比较，兼容 '2099-12-30' 与 '2099-12-30T00:00:00'
  return !!v && v.slice(0, 10) === LONG_TERM_EXPIRY.slice(0, 10);
}

/** 距有效期的天数：长期(2099)/空值返回 null；负数 = 已过期 */
export function expiryDays(v?: string | null): number | null {
  if (!v || isLongTerm(v)) return null;
  return dayjs(v).startOf('day').diff(dayjs().startOf('day'), 'day');
}

/** 临期/过期判定：唯一阈值出处。'expired' | 'near' | null */
export function expiryFlag(v?: string | null): 'expired' | 'near' | null {
  const d = expiryDays(v);
  if (d === null) return null;
  if (d < 0) return 'expired';
  if (d <= 30) return 'near'; // 阈值与后端 stats 同口径（§4-P1-6）；待业务确认后只改这里
  return null;
}

/** 有效期渲染：2099 → 长期；≤30 天临期；已过期红色 */
export function renderExpiry(v?: string | null) {
  if (!v) return '-';
  if (isLongTerm(v)) return <Tag>长期</Tag>;
  const days = expiryDays(v);
  if (days !== null && days < 0) {
    return <span style={{ color: '#cf1322' }}>{fmtDate(v)}（已过期）</span>;
  }
  if (days !== null && days <= 30) {
    return (
      <span style={{ color: '#d46b08' }}>
        {fmtDate(v)}（{days} 天后到期）
      </span>
    );
  }
  return fmtDate(v);
}

/** 批次号渲染：'-' → 无批次标签（'-' 是哨兵值非空值） */
export function renderBatch(v: string) {
  return v === NO_BATCH ? <Tag>无批次</Tag> : dash(v);
}

/** 是否药箱标签（字符串 '1'/'0'） */
export function renderMedicineBox(v: IsMedicineBox) {
  return (
    <Tag color={v === '1' ? 'blue' : 'default'}>{MEDICINE_BOX_MAP[v] ?? v}</Tag>
  );
}

type EnumTagMap = Record<number, { label: string; color: string }>;

/** 枚举标签渲染（详情抽屉打印状态/码状态共用） */
export function renderEnumTag(v: number, map: EnumTagMap) {
  const item = map[v];
  return item ? <Tag color={item.color}>{item.label}</Tag> : String(v);
}
/**
 * 截断展示：超过 n 字（默认 5）截断加省略号，悬停 Tooltip 显示全文；
 * 未超长原样返回、不包 Tooltip（避免悬停噪音）；空值走 dash 显示 '-'
 */
export function truncateText(v: string | null | undefined, n = 6) {
  const s = dash(v);
  if (s === '-' || s.length <= n) return s;
  return (
    <Tooltip title={s}>
      <span style={{ cursor: 'default' }}>{`${s.slice(0, n)}…`}</span>
    </Tooltip>
  );
}
/**
 * 组头库存合计展示：按包装换算为「X盒Y支」（盒 = packageUnit，支 = drugUnit）
 * 规则：整盒 + 余数；无整盒只显零数（1支 → 1支）；整除只显整盒（10支 → 1盒）；
 * 缺包装单位/换算率或换算率 ≤ 0 → 回退「N支」
 * 注意：total 为后端 totalInventory（drugUnit 口径），本函数只做展示换算，不做聚合
 */
export function formatTotalInventory(
  total: number,
  packageUnit: string | null,
  retailFactor: number | null,
  drugUnit: string,
): string {
  if (!packageUnit || !retailFactor || retailFactor <= 0)
    return `${total}${drugUnit}`;
  const boxes = Math.floor(total / retailFactor);
  const units = total % retailFactor;
  if (boxes === 0) return `${units}${drugUnit}`;
  if (units === 0) return `${boxes}${packageUnit}`;
  return `${boxes}${packageUnit}${units}${drugUnit}`;
}
