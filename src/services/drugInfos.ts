import { bizRequest } from '@/services/auth';
import type { IPage } from '@/utils/types';

/** 药品字典行（drug_infos 宽表，与后端实体 DrugInfos 对齐；密码/敏感字段不含） */
export interface DrugInfosItem {
  id: number;
  miId: number;

  /* ── 编码类 ── */
  phamStdCode?: string; // 药品编码（标准码）
  phamCode?: string; // 院内药品编码（租户内业务唯一）
  phamCateCode?: string; // 药品分类编码
  ypid?: string; // 药管平台码
  insuranceCode?: string; // 医保贯标码
  gbSerialNo?: string; // 国标流水号
  drugIdentifierCode?: string; // 药品标识码（追溯码前7位）

  /* ── 名称/描述 ── */
  phamName?: string;
  phamGeneralName?: string; // 药品通用名称
  phamEName?: string; // 药品英文名称
  phamNameInitial?: string; // 名称首字母（助记符）
  phamSpec?: string;
  dosageForm?: string;
  qualificationCode?: string; // 批准文号

  /* ── 单位/包装 ── */
  phamUnit?: string; // 基本单位
  doseUnit?: string; // 剂量单位（含量）
  dosePerUnit?: string; // 最小单位↔剂量单位换算系数（历史原因 varchar，勿当数字处理）
  packageUnit?: string; // 零售单位
  packageFactor?: number; // 零售包装含基本单位数量
  largePackageUnit?: string;
  largePackageFactor?: number; // 1大包装=N基本单位
  mediumPackageUnit?: string;
  mediumPackageFactor?: number;
  smallPackageUnit?: string;
  smallPackageFactor?: number;
  infusionVolume?: string;
  infusionUnit?: string;
  qualityUnit?: string; // 质量单位（mg/g）
  qualityUnitDosage?: number;
  volumeUnit?: string; // 体积单位（ml/L）
  volumeUnitDosage?: number;
  unitSeparationFlag?: number; // 是否可拆零 0否 1是（Integer）

  /* ── 价格 ── */
  retailPrice?: number;
  tradePrice?: number; // 内部结算批发价
  purchasePrice?: number;

  /* ── 厂家/分类/标志 ── */
  pharmacyFactory?: string; // 厂家名称
  manageLevel?: string; // 管理级别
  toxicologyProperty?: string; // 毒理分类（String，值域见值域代码）
  traceabilityType?: string; // 追溯类型 '1'麻醉 '2'精一 '3'易制毒（实体 String，非 number！）
  traceabilityFlag?: string; // 是否追溯 '0'否 '1'是（String）
  freeChargeFlag?: string; // 是否收费 '0'否 '1'是（String）
  hasRfidTraceCode?: number; // 是否有RFID追溯码 0无 1有（Integer）
  highRiskLevel?: string; // 高危药品标识
  basicPham?: string; // 基药 '0'否 '1'是

  /* ── 状态类 ── */
  drugUseStatus?: number; // 使用状态 1在用 0停用
  removalTime?: string; // 停用时间（启停接口后端联动）
  stopFlagPlan?: string; // 计划停用 '1'启用 '0'停用（注意语义：1=启用）
  stopFlagPur?: string; // 采购停用 '1'启用 '0'停用
  deleteFlag?: string; // 作废标志（软删）

  /* ── 时间 ── */
  createTime?: string; // 源系统同步时间（HIS 语义，前端只读展示）
  editTime?: string; // 源系统最近修改时间
  updateTime?: string; // 本系统更新时间

  [key: string]: any;
}

/** 选药下拉项（/options 返回） */
export interface DrugOption {
  id: number;
  phamCode: string;
  phamName: string;
  phamSpec?: string;
  dosageForm?: string;
  phamUnit?: string;
  retailPrice?: number;
  [key: string]: any;
}

export type DrugPageParams = {
  page: number;
  size: number;
  miId?: number;
  keyword?: string; // 后端五列模糊
  phamStdCode?: string; // 药品编码（列表页编码筛选）
  phamCateCode?: string;
  traceabilityType?: string; // 实体为 String
  traceabilityFlag?: string;
  manageLevel?: string;
  dosageForm?: string;
  drugUseStatus?: number;
};

/** 分页：keyword 后端做五列模糊 */
export async function pageDrugInfos(
  params: DrugPageParams,
): Promise<IPage<DrugInfosItem>> {
  return bizRequest<IPage<DrugInfosItem>>('/api/drug-infos/page', {
    method: 'GET',
    params,
  });
}

/** 选药下拉（默认仅返回在用药品）。keyword 防抖由组件层做 */
export async function getDrugOptions(params: {
  keyword?: string;
  miId?: number;
  limit?: number;
}): Promise<DrugOption[]> {
  return bizRequest<DrugOption[]>('/api/drug-infos/options', {
    method: 'GET',
    params,
  });
}

export async function getDrugDetail(id: number): Promise<DrugInfosItem> {
  return bizRequest<DrugInfosItem>(`/api/drug-infos/${id}`);
}

/** 新增：POST 根路径，无 /create 后缀（铁律⑤）。当前页面无新增入口，保留供其他调用方 */
export async function saveDrug(data: Record<string, any>): Promise<any> {
  return bizRequest('/api/drug-infos', { method: 'POST', data });
}

/** 修改：miId + 同步字段后端锁定；成功裸返 */
export async function updateDrug(
  data: Record<string, any> & { id: number },
): Promise<any> {
  return bizRequest('/api/drug-infos', { method: 'PUT', data });
}

/** 启用/停用：status 1在用 0停用（removalTime 联动由后端处理） */
export async function setDrugUseStatus(
  id: number,
  status: 0 | 1,
): Promise<void> {
  return bizRequest(`/api/drug-infos/${id}/use-status`, {
    method: 'PUT',
    params: { status },
  });
}

/** 作废（软删，详情仍可见） */
export async function voidDrug(id: number): Promise<void> {
  return bizRequest(`/api/drug-infos/${id}`, { method: 'DELETE' });
}
