/**
 * 菜单管理 共享渲染/选项 —— 契约：菜单管理 v2 §四枚举
 * v2：menuType(0/1/2) 取代 type；clientType 行级取代 appType；状态文案 正常/停用；
 *     renderAppType / classify / dynamicPerms 相关渲染已删除
 * 红线：枚举一律 String() 归一化比较
 */
import { Tag, Typography } from 'antd';
import {
  CLIENT_TYPE,
  EXTERNAL_TARGET,
  MENU_STATUS,
  MENU_TYPE,
  MENU_VISIBLE,
} from '@/services/org/menu';

const S = (v: string | number | null | undefined) => String(v ?? '');

export const MENU_TYPE_OPTIONS = [
  { value: MENU_TYPE.DIR, label: '目录' },
  { value: MENU_TYPE.MENU, label: '菜单' },
  { value: MENU_TYPE.BUTTON, label: '按钮' },
];

export const CLIENT_TYPE_OPTIONS = [
  { value: CLIENT_TYPE.WEB, label: '平台Web' },
  { value: CLIENT_TYPE.CABINET, label: '销毁柜' },
  { value: CLIENT_TYPE.PDA, label: 'PDA移动端' },
];

export const MENU_STATUS_OPTIONS = [
  { value: MENU_STATUS.NORMAL, label: '正常' },
  { value: MENU_STATUS.DISABLED, label: '停用' },
];

export const MENU_VISIBLE_OPTIONS = [
  { value: MENU_VISIBLE.YES, label: '是' },
  { value: MENU_VISIBLE.NO, label: '否' },
];

export const EXTERNAL_TARGET_OPTIONS = [
  { value: EXTERNAL_TARGET.NEW_WINDOW, label: '新窗口' },
  { value: EXTERNAL_TARGET.CURRENT, label: '当前窗口' },
];

export function renderMenuType(v?: string | number | null) {
  const map: Record<string, { text: string; color: string }> = {
    [MENU_TYPE.DIR]: { text: '目录', color: 'geekblue' },
    [MENU_TYPE.MENU]: { text: '菜单', color: 'blue' },
    [MENU_TYPE.BUTTON]: { text: '按钮', color: 'gold' },
  };
  const hit = map[S(v)];
  return hit ? <Tag color={hit.color}>{hit.text}</Tag> : S(v) || '-';
}

/** v2：clientType 行级（每行都有值），不再只限顶级 */
export function renderClientType(v?: string | number | null) {
  const map: Record<string, { text: string; color: string }> = {
    [CLIENT_TYPE.WEB]: { text: '平台Web', color: 'geekblue' },
    [CLIENT_TYPE.CABINET]: { text: '销毁柜', color: 'cyan' },
    [CLIENT_TYPE.PDA]: { text: 'PDA移动端', color: 'purple' },
  };
  const hit = map[S(v)];
  return hit ? <Tag color={hit.color}>{hit.text}</Tag> : S(v) || '-';
}

export function renderStatus(v?: string | number | null) {
  const s = S(v);
  if (!s) return '-';
  // v2 文案：1正常 2停用（值不变）；祖先链保留时按节点自身状态渲染，祖先不误标停用
  return s === MENU_STATUS.NORMAL ? (
    <Tag color="green">正常</Tag>
  ) : (
    <Tag>停用</Tag>
  );
}

export function renderVisible(v?: string | number | null) {
  const s = S(v);
  if (s === MENU_VISIBLE.YES) return <span>是</span>;
  if (s === MENU_VISIBLE.NO)
    return <Typography.Text type="secondary">否</Typography.Text>;
  return s || '-';
}

/** 外链标识：isExternal=0 → Tag（⚠️ 0=是 反直觉 §6.3；经 S 归一，空值视为否） */
export function renderExternal(v?: string | number | null) {
  return S(v) === '0' ? <Tag color="orange">外链</Tag> : null;
}
