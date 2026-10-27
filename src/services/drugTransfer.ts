/**
 * 药品出入库 services —— /drug-transfer 7 端点（交接文档 §2.1，全部联调通过）
 * ⚠️ miId 租户铁律（§5.1-1）：后端所有入口必传，统一在本服务层注入
 *    （getMiId 取自租户上下文，现阶段=12；登录接入后自动切换，页面零改动）
 * ⚠️ 业务错误 HTTP 500 + {code,message}（无 200 包裹层，§6.5-4）→ 拦截器统一 toast
 * ⚠️ 修改单据坑#2（items 三态）：null=不动明细 / 数组=全删全插 / []=清空，编辑页必须脏标记
 */
import { bizRequest } from '@/services/auth';
import { getMiId } from '@/services/tenant';
import type { IPage } from '@/utils/types';

/** 列表行（§6.3 DrugTransferHeadListVO，字段与后端一一对应） */
export type DrugTransferItem = {
  id: number;
  inoutNo: string;
  hisInoutNo?: string | null;
  ioDirection?: string;
  ioType?: string | null; // 字典 YN0.2.14【值域待补充 §6.7-2】
  inPharmacyCode?: string | null;
  inPharmacyName?: string | null;
  outPharmacyCode?: string | null;
  outPharmacyName?: string | null;
  deptCode?: string | null;
  deptName?: string | null;
  isMedicineBox?: string; // ⚠️ 字符串 '1'/'0'，非 boolean（§7.5）
  medicineCabinetName?: string | null;
  operatorNo?: string;
  operatorName?: string;
  checkNo?: string;
  checkName?: string | null;
  checkNo2?: string;
  checkName2?: string | null;
  inoutStatus?: string; // '1' 保存（待确认）/ '2' 提交
  printStatus?: string; // '1' 未打印 / '2' 已打印
  printCount?: number;
  firstDrugName?: string | null;
  firstIoUnit?: string | null;
  totalCount?: number | null; // 后端明细 count 合计（勿前端重算；单位口径问题已提后端确认）
  createTime?: string;
  updateTime?: string;
};

/** 明细行（DrugTransferDetailVO / SaveDTO 共用字段） */
export type DrugTransferDetailItem = {
  id?: number;
  drugCode?: string;
  drugName?: string;
  count?: number; // 出入库数量（出入库单位）
  ioUnit?: string;
  quantity?: number; // 基本单位数量
  inventory?: number; // 实际库存结存（基本单位）
  retailPrice?: number; // decimal(17,4)，展示精度待产品确认（§7.6-2）
  retailAmount?: number;
  batchNumber?: string; // '-' = 无批次哨兵
  expiryDate?: string; // yyyy-MM-dd；2099-12-30 = 长期
  productionDate?: string;
  factor?: number;
  retailFactor?: number;
  phamFactoryName?: string;
  prescriptionNos?: string; // 处方号，逗号分隔
  reqNos?: string; // 手术申请单号，逗号分隔
};

/** HIS 扩展单（详情 #3 按 hisInoutNo 反查回传的 hisExt[]，字段 ⊆ §6.3-4 VO） */
export type DrugIoExtendBrief = {
  id?: number;
  orderNumber?: string;
  operationType?: string; // ⚠️ 中文枚举：入库/出库（坑#12）
  medicineInOutType?: string | null; // HIS 字典【值域待补充 §6.8-3】
  deliveryOrderNumber?: string | null;
  linkedOutOrderNumber?: string | null;
  status?: string; // '0' 待办 / '1' 已办
  checkStatus?: number; // 0 待处理 / 1 已处理 / 2 验收失败 / 3 待认证（⚠️ 数字）
  systemType?: number; // 0 HIS / 1 自建
  supplier?: string | null;
  inPharmacyCode?: string | null;
  inPharmacyName?: string | null;
  outPharmacyCode?: string | null;
  outPharmacyName?: string | null;
  operatorName?: string | null;
  operatorTime?: string | null; // ISO datetime（坑#16）
};

export type DrugTransferDetail = DrugTransferItem & {
  details?: DrugTransferDetailItem[];
  hisExt?: DrugIoExtendBrief[]; // 按 hisInoutNo 反查扩展单（正向集成 D 组）
};

/** 分页查询参数（§6.2 全量） */
export interface DrugTransferPageQuery {
  page?: number;
  size?: number;
  inoutNo?: string;
  hisInoutNo?: string;
  ioDirection?: string;
  ioType?: string;
  deptCode?: string; // 执行科室/小药箱编码（head.dept_code，§6.2）；若后端参数名不同改这一处即可
  inPharmacyCode?: string;
  outPharmacyCode?: string;
  operatorName?: string;
  inoutStatus?: string;
  printStatus?: string; // 后端仍支持；本次 UI 按需求移除筛选入口
  beginTime?: string;
  endTime?: string;
}

/** 分页查询（平铺 IPage，total=单据数，§7.6-3） */
export async function pageDrugTransfer(
  params: DrugTransferPageQuery,
): Promise<IPage<DrugTransferItem>> {
  return bizRequest<IPage<DrugTransferItem>>('/api/drug-transfer/page', {
    method: 'GET',
    params: { ...params, miId: getMiId() },
  });
}

/** 详情（头 + 明细 + HIS 扩展单） */
export async function getDrugTransferDetail(id: number): Promise<DrugTransferDetail> {
  return bizRequest<DrugTransferDetail>(`/api/drug-transfer/${id}`, {
    method: 'GET',
    params: { miId: getMiId() },
  });
}

/** 新增（含明细 items）；inoutNo 不传自动生成，inoutStatus 不传默认 '2' */
export async function createDrugTransfer(
  data: Record<string, unknown>,
): Promise<{ id: number; message: string }> {
  return bizRequest<{ id: number; message: string }>('/api/drug-transfer', {
    method: 'POST',
    data: { ...data, miId: getMiId() },
  });
}

/** 修改（id 必传；坑#2：items 三态语义，不改明细就别传 items 字段） */
export async function updateDrugTransfer(
  data: Record<string, unknown>,
): Promise<{ message: string }> {
  return bizRequest<{ message: string }>('/api/drug-transfer', {
    method: 'PUT',
    data: { ...data, miId: getMiId() },
  });
}

/** 标记打印（print_count+1 非覆盖）；成功后调用方必须刷新列表（坑#7） */
export async function markPrinted(id: number): Promise<{ message: string }> {
  return bizRequest<{ message: string }>(`/api/drug-transfer/${id}/print`, {
    method: 'PUT',
    params: { miId: getMiId() },
  });
}

/** 首页统计（miId 必传——原页面漏传导致 stats 恒 500，已在服务层修复） */
export async function getTransferStats(): Promise<{
  todayIn: number;
  todayOut: number;
  pending: number;
  monthCount: number;
}> {
  return bizRequest('/api/drug-transfer/stats', {
    method: 'GET',
    params: { miId: getMiId() },
  });
}

/** 删除（头+明细物理删除，无回收站，坑#8）；调用方必须二次确认 */
export async function deleteDrugTransfer(id: number): Promise<{ message: string }> {
  return bizRequest<{ message: string }>(`/api/drug-transfer/${id}`, {
    method: 'DELETE',
    params: { miId: getMiId() },
  });
}

