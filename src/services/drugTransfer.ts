import { request } from '@umijs/max';

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

/** 分页查询 —— 返回 MyBatis-Plus 的 IPage 结构 */
export async function pageDrugTransfer(params: Record<string, any>) {
  return request<{
    records: DrugTransferItem[];
    total: number;
    current: number;
    size: number;
  }>('/api/drug-transfer/page', { method: 'GET', params });
}

/** 详情 */
export async function getDrugTransferDetail(id: number) {
  return request<DrugTransferDetail>(`/api/drug-transfer/${id}`);
}

/** 新增（含明细 items） */
export async function createDrugTransfer(data: Record<string, any>) {
  return request<{ id: number; message: string }>('/api/drug-transfer', {
    method: 'POST',
    data,
  });
}

/** 标记打印 */
export async function markPrinted(id: number) {
  return request<{ message: string }>(`/api/drug-transfer/${id}/print`, {
    method: 'PUT',
  });
}
/** 首页统计 */
export async function getTransferStats(miId?: number) {
  return request<{
    todayIn: number;
    todayOut: number;
    pending: number;
    monthCount: number;
  }>('/api/drug-transfer/stats', { method: 'GET', params: { miId } });
}

/** 删除（头+明细） */
export async function deleteDrugTransfer(id: number) {
  return request<{ message: string }>(`/api/drug-transfer/${id}`, {
    method: 'DELETE',
  });

}
