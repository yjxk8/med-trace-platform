/**
 * 部门/组织架构 services —— 存量模块按 R1~R6 收口：写操作统一 cleanPayload（R2）
 * 契约：
 * - GET /dept/tree?miId=&deptStatus= → 部门树（children 嵌套；miId 契约必传）
 * - POST /dept；PUT /dept（不允许改上级部门）；DELETE /dept/{id}（级联软删全部子孙）
 * - deptStatus：1启用 2禁用（tinyint 数字非布尔，比较一律 Number 归一化）
 */
import { bizRequest } from '@/services//auth';
import { getMiIdRequired } from '@/services/tenant';
import { cleanPayload } from '@/utils/payload'; // R2：唯一来源

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

/** 新增：POST /dept（parentId 0=顶级） */
export async function createDept(
  data: DeptSaveParams,
): Promise<{ id: number; message: string }> {
  return bizRequest<{ id: number; message: string }>('/api/dept', {
    method: 'POST',
    data: cleanPayload(data), // deptName trim；deptCode 空串剔除；deptStatus 数字原样保留
  });
}

/** 修改：PUT /dept（不允许改上级部门——前端不提交 parentId） */
export async function updateDept(data: DeptSaveParams): Promise<{ message: string }> {
  return bizRequest<{ message: string }>('/api/dept', {
    method: 'PUT',
    data: cleanPayload(data),
  });
}

/** 删除（级联软删全部子孙）：DELETE /dept/{id} */
export async function deleteDept(id: number): Promise<{ message: string }> {
  return bizRequest<{ message: string }>(`/api/dept/${id}`, { method: 'DELETE' });
}

// ==================== 药房下拉（供库存等业务模块复用，部门管理页不使用） ====================
// ⚠️ 以下逻辑本轮未动，仅随文件保留；deptType 口径待后端确认后只改 PHARMACY_DEPT_TYPE
/** 药房类型过滤值：待后端确认 deptType 取值后填入（如 'pharmacy'） */
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
      walk(n.children ?? []);
    }
  };
  walk(tree);
  return [...map.entries()].map(([deptCode, deptName]) => ({
    label: PHARMACY_DEPT_TYPE ? deptName : `${deptName}（${deptCode}）`,
    value: deptCode,
  }));
}

/** 药房下拉数据源：启用部门树（miId 从租户上下文取）→ 拍平；会话级缓存 */
let pharmacyCache: Promise<{ label: string; value: string }[]> | null = null;
export function listPharmacyOptions(): Promise<{ label: string; value: string }[]> {
  pharmacyCache ??= getDeptTree({ miId: getMiIdRequired(), deptStatus: 1 })
    .then(buildPharmacyOptions)
    .catch((e) => {
      pharmacyCache = null; // 失败自动失效，下次进页面重拉
      throw e;
    });
  return pharmacyCache;
}
