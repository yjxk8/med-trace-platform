/**
 * 菜单管理 services —— 契约唯一基准：后端变更说明-菜单管理-v2.md（终版 2026-10-14）
 * ⚠️ v2 破坏性变更：menuType(0目录/1菜单/2按钮) 取代 type；clientType 行级过滤取代 appType 应用级；
 *   app 字段/classify/dynamicPerms 全部删除；状态文案 1正常 2停用（值不变）
 * ⚠️ 路由不变（§三）：/menu/tree、/menu/detail/{id}、POST|PUT /menu、/menu/delete/{id}、/menu/{id}/status
 * ⚠️ children 语义：tree=叶子空数组 / detail=null（页面已归一 prune）
 * ⚠️ parentId 三态（§6.1）：编辑必须始终提交（0=顶级）；循环引用后端兜底，前端 MenuTreeSelect 禁选自身子树
 * ⚠️ isExternal 反直觉（§6.3/§八#1）：0=是外链，1=否——前端一律用布尔，转换只经 extToBool/boolToExt
 * ⚠️ 提交空串转 null（§二）：统一走 @/utils/payload.cleanPayload（R2，无豁免）；
 *   数字 0（menuType/parentId/isExternal）在清洗层原样保留，不被吞
 */
import { bizRequest } from '@/services/auth';
import { cleanPayload } from '@/utils/payload'; // R2：唯一来源（本模块无豁免键）

// ===== 枚举（§四字段字典）=====
/** menuType：0目录 1菜单(默认) 2按钮；⚠️ 有 0 值，表单按类型联动（§6.4） */
export const MENU_TYPE = { DIR: '0', MENU: '1', BUTTON: '2' } as const;
/** clientType：行级 1平台Web(默认) 2销毁柜 3PDA移动端；⚠️ 同一目录树下需一致维护，否则按端过滤断枝（§6.2） */
export const CLIENT_TYPE = { WEB: '1', CABINET: '2', PDA: '3' } as const;
/** status：1正常 2停用（v2 文案变更，值不变；默认1） */
export const MENU_STATUS = { NORMAL: '1', DISABLED: '2' } as const;
/** isVisible：1是 2否（默认1） */
export const MENU_VISIBLE = { YES: '1', NO: '2' } as const;
/** externalTarget：1新窗口(默认) 2当前窗口；仅外链有意义 */
export const EXTERNAL_TARGET = { NEW_WINDOW: '1', CURRENT: '2' } as const;

/**
 * §6.3 isExternal 布尔转换层（全工程唯一 0/1 触点）：
 * 后端 0=是外链、1=否（反直觉，§八#1 待确认）；表单/页面一律布尔，提交/回显处转换
 */
export const extToBool = (v: string | number | null | undefined): boolean =>
  String(v ?? '1') === '0';
export const boolToExt = (b: boolean): 0 | 1 => (b ? 0 : 1);

export type MenuTreeVO = {
  id: number;
  parentId: number; // 0=顶级（v2：一级目录，无「应用节点」概念）
  name: string;
  logo?: string | null; // 【§八#3 待定 URL/icon class】
  clientType: string | number; // 行级：1平台Web 2销毁柜 3PDA移动端；not null
  menuType: string | number; // 0目录 1菜单 2按钮；not null
  perms?: string | null; // RBAC 预留（模块:资源:操作），本期只存
  sort?: number;
  isVisible?: string | number;
  routing?: string | null; // 外链时=完整 URL（后端强校验必填）
  queryParam?: string | null; // 路由默认参数 JSON 字符串
  isExternal?: string | number; // ⚠️ 0是 1否
  externalTarget?: string | number; // 1新窗口 2当前窗口
  component?: string | null; // 组件地址（如 system/menu/index），动态路由用
  componentName?: string | null; // 组件名（前端路由 name，keep-alive 用）
  module?: string | null; // 【§八#4 取值约定待定】
  status?: string | number; // 1正常 2停用
  remark?: string | null;
  createTime?: string;
  updateTime?: string | null;
  children?: MenuTreeVO[] | null; // tree=叶子空数组；detail=null
};

/** MenuSaveDTO（§四）：新增无 id、修改必传 id；隐藏项不提交（null 不更新，见 §6.4 说明） */
export type MenuSaveDTO = {
  id?: number;
  parentId?: number; // ⚠️ 编辑必须始终提交（§6.1）；0=顶级
  name: string;
  logo?: string;
  clientType?: string;
  menuType?: string;
  perms?: string;
  sort?: number;
  isVisible?: string;
  routing?: string; // 外链必填（后端强校验「外链菜单必须填写路由地址」）
  queryParam?: string; // JSON 字符串
  isExternal?: number; // ⚠️ 0是 1否（经 boolToExt 转换后传入）
  externalTarget?: string; // 仅外链提交
  component?: string;
  componentName?: string;
  module?: string;
  status?: string;
  remark?: string;
};

// ===== 查询 =====

/** 树查询（§三#1）：query 全可选 clientType(1/2/3)/menuType(0/1/2)/status(1/2)/module(精确)/
 *  keyword(模糊：name/routing/perms/componentName)。
 *  ⚠️ v2 语义：全部条件=节点级匹配+祖先链保留（v1 appType 整树过滤已不存在）；无分页 */
export function getMenuTree(params: {
  clientType?: string;
  menuType?: string;
  status?: string;
  module?: string;
  keyword?: string;
}): Promise<MenuTreeVO[]> {
  return bizRequest<MenuTreeVO[]>('/api/menu/tree', { method: 'GET', params });
}

/** 详情（§6.5：编辑回显必须用 detail，children=null）；不存在 → 500「菜单不存在，id=x」 */
export function getMenuDetail(id: number): Promise<MenuTreeVO> {
  return bizRequest<MenuTreeVO>(`/api/menu/detail/${id}`);
}

// ===== 写操作（R2：cleanPayload 共享实现；数字 0 不吞——menuType=0 目录可正常提交）=====

/** 新增（不传 id；不传 parentId=顶级；后端默认 clientType/menuType/isVisible/sort/status/isExternal/externalTarget=1，
 *  menuType=1 为菜单；建目录显式传 menuType=0） */
export function createMenu(data: MenuSaveDTO): Promise<{ id: number; message: string }> {
  return bizRequest('/api/menu', { method: 'POST', data: cleanPayload(data) });
}

/** 修改（id 必传；null 不更新——清空/隐藏字段保存不生效；循环引用 → 500 友好文案） */
export function updateMenu(data: MenuSaveDTO & { id: number }): Promise<{ message: string }> {
  return bizRequest('/api/menu', { method: 'PUT', data: cleanPayload(data) });
}

/** 物理删除（无 del_flag，不可恢复）；有子节点 → 500「存在子菜单，请先删除子菜单」（前端已禁用，兜底） */
export function deleteMenu(id: number): Promise<{ message: string }> {
  return bizRequest(`/api/menu/delete/${id}`, { method: 'DELETE' });
}

/** 启用(1)/停用(2)；缺参 → 500「状态值非法：1正常 2停用」；成功消息「已启用」/「已停用」透传 */
export function setMenuStatus(id: number, status: 1 | 2): Promise<{ message: string }> {
  return bizRequest(`/api/menu/${id}/status`, { method: 'PUT', params: { status } });
}
