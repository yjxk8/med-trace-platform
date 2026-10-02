import { bizRequest } from '@/services/auth';

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
