/**
 * 部门管理 共享渲染/选项 —— deptStatus 为 tinyint 数字（1启用 2禁用），Number 归一化比较
 */
import { Tag } from 'antd';

export const DEPT_STATUS = { ENABLED: 1, DISABLED: 2 } as const;

export const DEPT_STATUS_OPTIONS = [
  { value: DEPT_STATUS.ENABLED, label: '启用' },
  { value: DEPT_STATUS.DISABLED, label: '禁用' },
];

export function renderDeptStatus(v?: string | number | null) {
  if (v == null) return '-';
  return Number(v) === DEPT_STATUS.ENABLED ? (
    <Tag color="green">启用</Tag>
  ) : (
    <Tag>禁用</Tag>
  );
}
