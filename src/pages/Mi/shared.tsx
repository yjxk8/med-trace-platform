/**
 * 医疗机构 共享渲染/选项 —— 契约：医疗机构 v1 §四
 * 红线：tinyint→Integer（§一.7），枚举一律 String() 归一化比较
 * 日期格式走 @/utils/format（R5），本模块不本地定义 fmtFull
 */
import { Tag } from 'antd';
import { MI_STATUS, MI_TENANT_TYPE, type MiVO } from '@/services/org/mi';

const S = (v: string | number | null | undefined) => String(v ?? '');

export const MI_TENANT_TYPE_OPTIONS = [
  { value: MI_TENANT_TYPE.HOSPITAL, label: '医院' },
  { value: MI_TENANT_TYPE.REGION, label: '区域卫健委' },
];

export const MI_STATUS_OPTIONS = [
  { value: MI_STATUS.NORMAL, label: '正常' },
  { value: MI_STATUS.CLOSED, label: '关闭' },
];

export function renderTenantType(v?: string | number | null) {
  const s = S(v);
  if (s === MI_TENANT_TYPE.HOSPITAL) return <Tag color="geekblue">医院</Tag>;
  if (s === MI_TENANT_TYPE.REGION) return <Tag color="purple">区域卫健委</Tag>;
  return s || '-';
}

/** §一.6：关闭=业务停用（灰、可恢复），与删除（永久）视觉区分 */
export function renderStatus(v?: string | number | null) {
  const s = S(v);
  if (!s) return '-';
  return s === MI_STATUS.NORMAL ? (
    <Tag color="green">正常</Tag>
  ) : (
    <Tag>关闭</Tag>
  );
}

/** 所在地（省/市/县区 §四地址六段前三段） */
export function renderRegion(r: Pick<MiVO, 'province' | 'city' | 'county'>) {
  const t = [r.province, r.city, r.county].filter(Boolean).join(' / ');
  return t || '-';
}
