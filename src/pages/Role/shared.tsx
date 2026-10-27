/**
 * 角色管理 共享渲染/选项 —— 契约：角色管理 v1.0 §6.2 枚举
 * 红线：枚举一律 String() 归一化比较（对齐菜单模块 shared.tsx）
 */
import { Tag } from 'antd';
import { DATA_SCOPE, ROLE_SCOPE, ROLE_TYPE } from '@/services/org/role';

const S = (v: string | number | null | undefined) => String(v ?? '');

export const ROLE_TYPE_OPTIONS = [
  { value: ROLE_TYPE.PLATFORM, label: '平台角色' },
  { value: ROLE_TYPE.HOSPITAL, label: '医院角色' },
  { value: ROLE_TYPE.REGION, label: '区域角色' },
];

export const DATA_SCOPE_OPTIONS = [
  { value: DATA_SCOPE.ALL, label: '全部数据权限' },
  { value: DATA_SCOPE.DEPT, label: '本部门数据权限' },
  { value: DATA_SCOPE.DEPT_AND_CHILD, label: '本部门及以下' },
];

export const ROLE_SCOPE_OPTIONS = [
  { value: ROLE_SCOPE.PUBLIC, label: '公共角色' },
  { value: ROLE_SCOPE.NORMAL, label: '普通角色' },
];

export function renderRoleType(v?: string | number | null) {
  const map: Record<string, { text: string; color: string }> = {
    [ROLE_TYPE.PLATFORM]: { text: '平台角色', color: 'geekblue' },
    [ROLE_TYPE.HOSPITAL]: { text: '医院角色', color: 'blue' },
    [ROLE_TYPE.REGION]: { text: '区域角色', color: 'purple' },
  };
  const hit = map[S(v)];
  return hit ? <Tag color={hit.color}>{hit.text}</Tag> : S(v) || '-';
}

/** dataScope：范围越大越敏感（区域监管账号可见麻精流通数据范围，二期联合合规组评审 §3） */
export function renderDataScope(v?: string | number | null) {
  const map: Record<string, { text: string; color: string }> = {
    [DATA_SCOPE.ALL]: { text: '全部数据权限', color: 'volcano' },
    [DATA_SCOPE.DEPT]: { text: '本部门数据权限', color: 'cyan' },
    [DATA_SCOPE.DEPT_AND_CHILD]: { text: '本部门及以下', color: 'green' },
  };
  const hit = map[S(v)];
  return hit ? <Tag color={hit.color}>{hit.text}</Tag> : S(v) || '-';
}

export function renderRoleScope(v?: string | number | null) {
  const map: Record<string, { text: string; color: string }> = {
    [ROLE_SCOPE.PUBLIC]: { text: '公共角色', color: 'gold' },
    [ROLE_SCOPE.NORMAL]: { text: '普通角色', color: 'default' },
  };
  const hit = map[S(v)];
  return hit ? <Tag color={hit.color}>{hit.text}</Tag> : S(v) || '-';
}
