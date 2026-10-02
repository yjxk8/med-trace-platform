import { bizRequest } from '@/services/auth';
import type { IPage } from '@/utils/types';

/** 列表行 */
export type DrugTransferItem = {
  id: number;
  inoutNo: string;
  hisInoutNo?: string;
  ioDirection?: string;
  ioType?: string;
  inPharmacyCode?: string;
  outPharmacyCode?: string;
  operatorName?: string;
  inoutStatus?: string;
  printStatus?: string;
  printCount?: number;
  createTime?: string;
};

/** 明细行 */
export type DrugTransferDetailItem = {
  id: number;
  drugCode?: string;
  drugName?: string;
  count?: number;
  ioUnit?: string;
  quantity?: number;
  retailPrice?: number;
  retailAmount?: number;
  batchNumber?: string;
  expiryDate?: string;
  phamFactoryName?: string;
};

/** 详情（头 + 明细） */
export type DrugTransferDetail = DrugTransferItem & {
  checkName?: string;
  medicineCabinetName?: string;
  deptCode?: string;
  updateTime?: string;
  details?: DrugTransferDetailItem[];
  firstDrugName?: string;
  firstIoUnit?: string;
  totalCount?: number;
};

/**
 * 分页查询 —— 后端裸返 IPage 结构（records/total/current/size），
 * token 由全局拦截器经 Authorization 头自动附带，禁止手工拼 ?token=
 */
export async function pageDrugTransfer(
  params: Record<string, any>,
): Promise<IPage<DrugTransferItem>> {
  return bizRequest<IPage<DrugTransferItem>>('/api/drug-transfer/page', {
    method: 'GET',
    params,
  });
}

/** 详情 */
export async function getDrugTransferDetail(id: number): Promise<DrugTransferDetail> {
  return bizRequest<DrugTransferDetail>(`/api/drug-transfer/${id}`);
}

/** 新增（含明细 items） */
export async function createDrugTransfer(
  data: Record<string, any>,
): Promise<{ id: number; message: string }> {
  return bizRequest<{ id: number; message: string }>('/api/drug-transfer', {
    method: 'POST',
    data,
  });
}

/** 标记打印 */
export async function markPrinted(id: number): Promise<{ message: string }> {
  return bizRequest<{ message: string }>(`/api/drug-transfer/${id}/print`, {
    method: 'PUT',
  });
}

/** 首页统计 */
export async function getTransferStats(miId?: number): Promise<{
  todayIn: number;
  todayOut: number;
  pending: number;
  monthCount: number;
}> {
  return bizRequest('/api/drug-transfer/stats', { method: 'GET', params: { miId } });
}

/** 删除（头+明细） */
export async function deleteDrugTransfer(id: number): Promise<{ message: string }> {
  return bizRequest<{ message: string }>(`/api/drug-transfer/${id}`, {
    method: 'DELETE',
  });
}
