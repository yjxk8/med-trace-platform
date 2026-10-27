/**
 * 字典模块共享渲染工具（类型树 / 字典项表格单一来源，防两处漂移）
 * 红线：
 * - createTime 兼容 '2026-08-21T14:14:25'（带T）与 'yyyy-MM-dd HH:mm:ss' 两种形态，dayjs 统一解析
 * - 状态口径唯一出处：'0'=启用 / 其余=停用（后端字段类型未定，String 归一化比较）
 * - dictValue（值域代码）是编码语义，字符串原样展示，禁止 Number 化（防 2015 → 2,015 类漂移）
 */
import { Tag } from 'antd';
import dayjs from 'dayjs';

export const fmtFull = (v?: string | null) =>
  v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-';

export const isOn = (v?: string | number | null) => String(v ?? '') === '0';

export function renderStatus(v?: string | number | null) {
  return isOn(v) ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>;
}
