import { bizRequest } from '@/services/auth';
import { getMiId } from './tenant';
/** 部门树节点（对应后端 DeptTreeVO） */
export type DeptTreeNode = {
  id: number;
  miId: number;
  deptName: string;
  deptCode?: string;
  parentId: number;
  deptPath?: string;
  deptLevel: number;
  sortOrder?: number;
  deptStatus: number; // 1启用 2禁用
  deptType?: string;
  children?: DeptTreeNode[];
};

export type DeptSaveParams = {
  id?: number;
  miId: number;
  deptName: string;
  deptCode?: string;
  parentId?: number;
  sortOrder?: number;
  deptStatus?: number;
  deptType?: string;
};

/** 部门树：GET /dept/tree?miId=12&deptStatus=1 */
export async function getDeptTree(params: {
  miId: number;
  deptStatus?: number;
}): Promise<DeptTreeNode[]> {
  return bizRequest<DeptTreeNode[]>('/api/dept/tree', { method: 'GET', params });
}

/** 新增：POST /dept */
export async function createDept(
  data: DeptSaveParams,
): Promise<{ id: number; message: string }> {
  return bizRequest<{ id: number; message: string }>('/api/dept', { method: 'POST', data });
}

/** 修改：PUT /dept（不允许改上级部门） */
export async function updateDept(data: DeptSaveParams): Promise<{ message: string }> {
  return bizRequest<{ message: string }>('/api/dept', { method: 'PUT', data });
}

/** 删除（级联软删全部子孙）：DELETE /dept/{id} */
export async function deleteDept(id: number): Promise<{ message: string }> {
  return bizRequest<{ message: string }>(`/api/dept/${id}`, { method: 'DELETE' });
}
// ==================== 药房下拉（供库存等业务模块复用，部门管理页不使用） ====================

/**
 * 药房类型过滤值：待后端确认 deptType 取值后填入（如 'pharmacy'）；
 * 填入后仅返回该类型节点；留空 → 回退为「全部启用节点中带 deptCode 的项」
 * ⚠️ 现口径偏宽：树里科室/药箱层级的节点若也有 deptCode 会混入下拉，
 * 后端确认 deptType 口径后只改本常量即可收紧
 */
export const PHARMACY_DEPT_TYPE = '';

/** 部门树 → 药房下拉项：拍平 + 过滤无 deptCode 节点 + 按 deptCode 去重；纯函数 */
export function buildPharmacyOptions(
  tree: DeptTreeNode[],
): { label: string; value: string }[] {
  const map = new Map<string, string>();
  const walk = (nodes: DeptTreeNode[]) => {
    for (const n of nodes) {
      const typeOk = !PHARMACY_DEPT_TYPE || n.deptType === PHARMACY_DEPT_TYPE;
      if (typeOk && n.deptCode) map.set(n.deptCode, n.deptName);
      walk(n.children ?? []); // 类型不匹配也继续走子树：类型可能只标在某层
    }
  };
  walk(tree);
  return [...map.entries()].map(([deptCode, deptName]) => ({
    // 无类型过滤时 label 带 code 便于区分同名部门；确认 deptType 后可只留名称
    label: PHARMACY_DEPT_TYPE ? deptName : `${deptName}（${deptCode}）`,
    value: deptCode,
  }));
}

/** 药房下拉数据源：启用部门树（miId 从租户上下文取，禁用节点服务端已滤）→ 拍平；会话级缓存 */
let pharmacyCache: Promise<{ label: string; value: string }[]> | null = null;

export function listPharmacyOptions(): Promise<{ label: string; value: string }[]> {
  pharmacyCache ??= getDeptTree({ miId: getMiId(), deptStatus: 1 })
    .then(buildPharmacyOptions)
    .catch((e) => {
      pharmacyCache = null; // 失败自动失效，下次进页面重拉
      throw e;
    });
  return pharmacyCache;
}
