/**
 * 用户组 共享渲染/选项 —— 红线：枚举字段一律 String() 归一化比较（S()）；
 * 映射不到的值显原文，信息不丢（同 User/shared 先例）
 */
import { Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import {
  AUTO_EXPIRE_ACTION,
  GROUP_STATUS,
  GROUP_TYPE,
  NARCOTIC,
} from '@/services/org/userGroup';

const S = (v: string | number | null | undefined) => String(v ?? '');

export const GROUP_TYPE_OPTIONS = [
  { value: GROUP_TYPE.DEPT, label: '科室组' },
  { value: GROUP_TYPE.POST, label: '岗位组' },
  { value: GROUP_TYPE.SPECIAL, label: '专项组' },
  { value: GROUP_TYPE.TEMP, label: '临时组' },
];

export const NARCOTIC_OPTIONS = [
  { value: NARCOTIC.YES, label: '麻精敏感组' },
  { value: NARCOTIC.NO, label: '普通' },
];

export const GROUP_STATUS_OPTIONS = [
  { value: GROUP_STATUS.NORMAL, label: '正常' },
  { value: GROUP_STATUS.DISABLED, label: '停用' },
];

export const AUTO_EXPIRE_OPTIONS = [
  { value: AUTO_EXPIRE_ACTION.REMIND, label: '仅提醒' },
  { value: AUTO_EXPIRE_ACTION.DISABLE, label: '停用组' },
  { value: AUTO_EXPIRE_ACTION.DISABLE_UNAUTH, label: '停用并解除授权' },
];

/** dept 模块 §6.3 枚举（deptScope.deptTypes 用；51/52 麻精关键岗位） */
export const DEPT_TYPE_OPTIONS = [
  { value: '0', label: '其他' },
  { value: '1', label: '临床专科' },
  { value: '2', label: '病区' },
  { value: '3', label: '门诊' },
  { value: '4', label: '医技' },
  { value: '51', label: '药库' },
  { value: '52', label: '药房' },
  { value: '6', label: '手术' },
  { value: '7', label: '护理单元' },
];

export const JOIN_SOURCE_MAP: Record<string, string> = {
  '1': '手动',
  '2': '批量',
  '3': '导入',
  '4': '事件驱动',
  '5': '续期',
};

export function renderGroupType(v?: string | number | null) {
  const map: Record<string, { text: string; color: string }> = {
    [GROUP_TYPE.DEPT]: { text: '科室组', color: 'blue' },
    [GROUP_TYPE.POST]: { text: '岗位组', color: 'cyan' },
    [GROUP_TYPE.SPECIAL]: { text: '专项组', color: 'purple' },
    [GROUP_TYPE.TEMP]: { text: '临时组', color: 'default' },
  };
  const hit = map[S(v)];
  return hit ? <Tag color={hit.color}>{hit.text}</Tag> : S(v) || '-';
}

export function renderNarcotic(v?: string | number | null) {
  return S(v) === NARCOTIC.YES ? (
    <Tag color="red">麻精敏感组</Tag>
  ) : (
    <Tag>普通</Tag>
  );
}

export function renderGroupStatus(v?: string | number | null) {
  const s = S(v);
  if (!s) return '-';
  return s === GROUP_STATUS.NORMAL ? (
    <Tag color="green">正常</Tag>
  ) : (
    <Tag>停用</Tag>
  );
}

export function renderAutoExpire(v?: string | number | null) {
  const s = S(v);
  if (s === AUTO_EXPIRE_ACTION.REMIND)
    return (
      <Tooltip title="提醒通道待接入">
        <Tag>仅提醒</Tag>
      </Tooltip>
    );
  if (s === AUTO_EXPIRE_ACTION.DISABLE) return <Tag color="orange">停用组</Tag>;
  if (s === AUTO_EXPIRE_ACTION.DISABLE_UNAUTH)
    return <Tag color="volcano">停用并解除授权</Tag>;
  return s || '-';
}

/** 到期三态：已过期（红）/ ≤7 天（橙）/ 正常。供列表 validTo 列与 Drawer 摘要用 */
export function renderValidToCell(v?: string | null) {
  if (!v) return '-';
  const d = dayjs(v);
  if (!d.isValid()) return v;
  if (d.isBefore(dayjs(), 'day'))
    return (
      <span>
        {v} <Tag color="red">已过期</Tag>
      </span>
    );
  if (d.diff(dayjs(), 'day') <= 7)
    return (
      <span>
        {v} <Tag color="orange">即将到期</Tag>
      </span>
    );
  return v;
}

export const fmtFull = (v?: string | null) =>
  v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-';
// ===== v1.2 追加：组授权 / 合规确认 / 审计 渲染 =====

/** joinSource 已由 v1.2 §四 补齐——映射不到仍显原文 */
export function renderGrantStatus(v?: string | number | null) {
  const map: Record<string, { text: string; color: string }> = {
    '1': { text: '生效中', color: 'green' },
    '2': { text: '未生效', color: 'blue' },
    '3': { text: '已过期', color: 'default' },
    '4': { text: '已解除', color: 'default' },
  };
  const hit = map[S(v)];
  return hit ? <Tag color={hit.color}>{hit.text}</Tag> : S(v) || '-';
}

export function renderRoleDeleted(v?: string | number | null) {
  return S(v) === '2' ? <Tag>已删除</Tag> : null;
}

export const CONFIRM_STATUS_OPTIONS = [
  { value: '1', label: '待确认' },
  { value: '2', label: '已通过' },
  { value: '3', label: '已驳回' },
  { value: '4', label: '已超时' },
];

export function renderConfirmStatus(v?: string | number | null) {
  const map: Record<string, { text: string; color: string }> = {
    '1': { text: '待确认', color: 'orange' },
    '2': { text: '已通过', color: 'green' },
    '3': { text: '已驳回', color: 'red' },
    '4': { text: '已超时', color: 'default' },
  };
  const hit = map[S(v)];
  return hit ? <Tag color={hit.color}>{hit.text}</Tag> : S(v) || '-';
}

export function renderConfirmBizType(v?: string | number | null) {
  return S(v) === '2' ? (
    <Tag color="purple">组授权变更</Tag>
  ) : (
    <Tag>组成员变更</Tag>
  );
}

export const AUDIT_BIZ_TYPE_OPTIONS = [
  { value: '1', label: '组管理' },
  { value: '2', label: '成员变更' },
  { value: '3', label: '组授权' },
  { value: '4', label: '直接授权' },
  { value: '5', label: '确认单流转' },
  { value: '6', label: '定时任务' },
];

export const AUDIT_SOURCE_OPTIONS = [
  { value: '1', label: '后台手动' },
  { value: '2', label: '导入' },
  { value: '3', label: '事件' },
  { value: '4', label: '定时任务' },
  { value: '5', label: '确认单执行' },
];

export function renderNarcoticFlag(v?: string | number | null) {
  return S(v) === '1' ? (
    <Tag color="red">涉麻精</Tag>
  ) : (
    <span style={{ color: '#bfbfbf' }}>否</span>
  );
}

export function renderDataScopeText(v?: string | number | null) {
  const map: Record<string, string> = {
    '1': '全部数据权限',
    '2': '本部门数据权限',
    '3': '本部门及以下',
  };
  return map[S(v)] ?? (S(v) || '-');
}
