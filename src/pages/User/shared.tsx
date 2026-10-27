/**
 * 用户管理 共享渲染/选项 —— 契约：v3 §四枚举速查
 * 命名红线：v3 已废除全部 uXxx key，本文件常量/函数统一无 U 前缀（USER_TYPE / renderType ...），
 * 防止按旧契约写出 uType/uStatus 之类的幽灵字段
 * 红线：枚举字段类型未定，一律 String() 归一化比较
 */
import { Tag } from 'antd';
import dayjs from 'dayjs';
import {
  LOGIN_STATUS,
  USER_IS_TRAINEE,
  USER_PRESC_CLASS,
  USER_SEX,
  USER_STATUS,
  USER_TENANT_TYPE,
  USER_TYPE,
} from '@/services/org/user';

export const fmtFull = (v?: string | null) =>
  v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-';

const S = (v: string | number | null | undefined) => String(v ?? '');

export const USER_TYPE_OPTIONS = [
  { value: USER_TYPE.ADMIN, label: '系统管理员' },
  { value: USER_TYPE.ORG_ADMIN, label: '机构管理员' },
  { value: USER_TYPE.ORG_USER, label: '医疗机构普通用户' },
];

export const USER_TENANT_TYPE_OPTIONS = [
  { value: USER_TENANT_TYPE.HOSPITAL, label: '医院' },
  { value: USER_TENANT_TYPE.REGION, label: '区域' },
];

export const USER_SEX_OPTIONS = [
  { value: USER_SEX.MALE, label: '男' },
  { value: USER_SEX.FEMALE, label: '女' },
  { value: USER_SEX.UNKNOWN, label: '未知' },
];

export const USER_IS_TRAINEE_OPTIONS = [
  { value: USER_IS_TRAINEE.YES, label: '是' },
  { value: USER_IS_TRAINEE.NO, label: '否' },
];

export const USER_PRESC_CLASS_OPTIONS = [
  { value: USER_PRESC_CLASS.NARCOTIC, label: '麻醉药品' },
  { value: USER_PRESC_CLASS.PSY1, label: '第一类精神药品' },
  { value: USER_PRESC_CLASS.PSY2, label: '第二类精神药品' },
  { value: USER_PRESC_CLASS.NORMAL, label: '普通处方' },
];

export const USER_STATUS_OPTIONS = [
  { value: USER_STATUS.NORMAL, label: '正常' },
  { value: USER_STATUS.LOCKED, label: '已锁定' },
];

/** 红/蓝/紫（配色沿用，文案随 v3 终版） */
export function renderType(v?: string | number | null) {
  const map: Record<string, { text: string; color: string }> = {
    [USER_TYPE.ADMIN]: { text: '系统管理员', color: 'red' },
    [USER_TYPE.ORG_ADMIN]: { text: '机构管理员', color: 'blue' },
    [USER_TYPE.ORG_USER]: { text: '医疗机构普通用户', color: 'purple' },
  };
  const hit = map[S(v)];
  return hit ? <Tag color={hit.color}>{hit.text}</Tag> : S(v) || '-';
}

/** 医院/区域（配色为前端约定，可调） */
export function renderTenantType(v?: string | number | null) {
  if (S(v) === USER_TENANT_TYPE.REGION) return <Tag color="gold">区域</Tag>;
  if (S(v) === USER_TENANT_TYPE.HOSPITAL)
    return <Tag color="geekblue">医院</Tag>;
  return S(v) || '-';
}

export function renderStatus(v?: string | number | null) {
  const s = S(v);
  if (!s) return '-'; // 空值不误显示「已锁定」
  return s === USER_STATUS.NORMAL ? (
    <Tag color="green">正常</Tag>
  ) : (
    <Tag>已锁定</Tag>
  );
}

export function renderLoginStatus(v?: string | number | null) {
  const s = S(v);
  if (s === LOGIN_STATUS.NEVER) return <Tag color="orange">未登录过</Tag>;
  if (s === LOGIN_STATUS.RESET) return <Tag color="orange">密码已重置</Tag>;
  return <span style={{ color: '#8c8c8c' }}>已登录</span>;
}

/** 处方类别文案（详情展示/后续列表用） */
export function renderPrescClass(v?: string | number | null) {
  const map: Record<string, string> = {
    [USER_PRESC_CLASS.NARCOTIC]: '麻醉药品',
    [USER_PRESC_CLASS.PSY1]: '第一类精神药品',
    [USER_PRESC_CLASS.PSY2]: '第二类精神药品',
    [USER_PRESC_CLASS.NORMAL]: '普通处方',
  };
  return map[S(v)] || S(v) || '-';
}

/** 性别：1男 2女 9未知。⚠️ 存量脏数据（"女" 等中文字面量）映射不到时回显原文，信息不丢 */
export function renderSex(v?: string | number | null) {
  const map: Record<string, string> = {
    [USER_SEX.MALE]: '男',
    [USER_SEX.FEMALE]: '女',
    [USER_SEX.UNKNOWN]: '未知',
  };
  return map[S(v)] ?? (S(v) || '-');
}
