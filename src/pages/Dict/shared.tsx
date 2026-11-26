/**
 * 字典模块共享工具（状态口径/渲染单一来源，防两处漂移）
 * 红线：
 * - createTime/updateTime 格式后端【待补充】（yyyy-MM-dd HH:mm:ss 或 ISO）→ dayjs 双形态兼容
 * - 状态口径唯一出处：'0'=启用 / 其余=停用（String 归一化比较；坑#3：出参是字符串）
 * - dictValue（值域代码）是编码语义，字符串原样展示，禁止 Number 化
 */
import { Tag } from 'antd';
import dayjs from 'dayjs';
import { DICT_TYPE_META, SCOPE_META, SCOPE_TAG_COLOR } from './constants';

export const fmtFull = (v?: string | null) =>
  v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-';

export const isOn = (v?: string | number | null) => String(v ?? '') === '0';

/** 旧版页面仍在引用，保留导出 */
export function renderStatus(v?: string | number | null) {
  return isOn(v) ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>;
}

/** 平台标准徽标（platform=miId===-1 派生只读：编辑/删除禁用、状态开关可用） */
export function renderPlatform(v?: boolean | null) {
  return v ? <Tag color="gold">标准</Tag> : '-';
}

/** 分组 Tag：1国标/2院内/3平台/4行标 */
export function renderScopeTag(v?: string | number | null) {
  const meta = SCOPE_META.find((s) => s.value === String(v ?? ''));
  if (!meta) return '-';
  return (
    <Tag color={SCOPE_TAG_COLOR[meta.value] ?? 'default'}>{meta.label}</Tag>
  );
}

/** 实体/映射 Tag（dictType，§6.2 定稿文案） */
export function renderDictTypeTag(v?: string | number | null) {
  const meta = DICT_TYPE_META.find((s) => s.value === String(v ?? ''));
  if (!meta) return '-';
  return (
    <Tag color={meta.value === '0' ? 'default' : 'orange'}>{meta.label}</Tag>
  );
}
