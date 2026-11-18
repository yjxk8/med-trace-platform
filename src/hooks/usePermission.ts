// src/utils/permCodes.ts
/** ⚠️ 权限点编码值全部待后端确认(K2),当前为占位;页面只 import 常量,替换只改本文件 */
export const PERM = {
  USER_ADD: 'user:add',
  USER_LOCK: 'user:lock',
  ROLE_GRANT: 'role:grant',
  NARCOTIC_DESTROY: 'narcotic:destroy', // 示例:麻精销毁(待 K3)
} as const;

// src/hooks/usePermission.ts
import { useModel } from '@umijs/max';
import type { PermContext } from '@/utils/permission';

export function usePermission() {
  const { initialState } = useModel('@@initialState');
  const perm = (initialState as any)?.perm as PermContext | undefined;
  return {
    perm,
    /** 权限点:has(PERM.USER_ADD) */
    has: (code: string) => !!perm?.permCodes?.includes(code),
    /** 麻精关键权限(双人核验/销毁确认):hasCritical(PERM.NARCOTIC_DESTROY) */
    hasCritical: (code: string) => !!perm?.criticalMenus?.includes(code),
  };
}
// 页面用法:{has(PERM.USER_ADD) && <Button>新增用户</Button>}
// 无权限时不渲染(而非 disabled)——与后端「未授权接口 403」双层防线
