/**
 * 药品库存模块（inv）类型定义
 * 来源：后端交接文档 2.2 字段字典 + 2.1 接口清单 + 6.2 响应示例
 *
 * ⚠️ 全模块红线：
 * 1. barcode 全链路 String，禁止 parseInt/Number()/toFixed（20 位超 JS 安全整数 2^53）
 * 2. 本模块接口均为「裸返」，无外层 envelope，请求封装不要解 .data.data
 * 3. batchNumber = '-' 表示无批次（占位值非空值）；expiryDate = 2099-12-30 表示长期
 * 4. currentInventory = 0 是合法在库值，不得过滤
 */

// ==================== 通用类型别名 ====================

/** LocalDateTime 的 JSON 形态：2025-12-01T10:30:00（ISO 带 T，库存主表用） */
import { bizRequest } from '../auth';
import { getMiId } from '../tenant';

export type DateTimeISO = string;

/** LocalDate 的 JSON 形态：2026-05-20（纯日期无 T，仅追溯码实例表用） */
export type DateOnly = string;

// ==================== 特殊值哨兵常量 ====================

/** 无批次占位值（表里存 '-' 而非 NULL；筛选「无批次」时传字面量 '-'） */
export const NO_BATCH = '-';

/** 「长期」有效期占位值（前端做临期高亮/排序必须排除此值，后端 stats 已天然排除） */
export const LONG_TERM_EXPIRY = '2099-12-30T00:00:00';

// ==================== 枚举映射 ====================

export type IsMedicineBox = '1' | '0';
export type PrintStatus = 0 | 1 | 2;
export type DrugUnitStatus = 0 | 1 | 2 | 3 | 4 | 5;

/** 打印状态（只读展示，流转操作归打印模块） */
export const PRINT_STATUS_MAP: Record<PrintStatus, { label: string; color: string }> = {
  0: { label: '未打印', color: 'default' }, // 灰
  1: { label: '已打印', color: 'green' },
  2: { label: '已作废', color: 'red' },
};

/** 码状态（只读展示，流转操作归报损模块） */
export const DRUG_UNIT_STATUS_MAP: Record<DrugUnitStatus, { label: string; color: string }> = {
  0: { label: '正常', color: 'green' },
  1: { label: '作废', color: 'red' },
  2: { label: '已配置', color: 'blue' },
  3: { label: '已过期', color: 'orange' },
  4: { label: '已执行', color: 'purple' },
  5: { label: '已报损', color: 'default' }, // 灰
};

/** 是否药箱（注意是字符串 '1'/'0'，非数字） */
export const MEDICINE_BOX_MAP: Record<IsMedicineBox, string> = {
  '1': '药箱',
  '0': '非药箱',
};

// ==================== 入参类型 ====================

/**
 * GET /pharmacy-drug-stock/page 入参
 * ⚠️ miId 必传，缺失后端返回 500「租户ID不能为空」（B 方案守卫），请求层应前置拦截
 * ⚠️ 日期必须传 ISO 带 T 格式（Element Plus Range 用 value-format="YYYY-MM-DDTHH:mm:ss"）
 */
export interface DrugStockPageParams {
  /** 页码，默认 1 */
  page?: number;
  /** 每页条数，默认 10 */
  size?: number;
  /** 租户ID（必传！） */
  miId: number;
  /** 药房 code，精确匹配 */
  pharmacyCode?: string;
  /** 药品名称/拼音首字母模糊（后端 mdm 预查标准码 → 分块 IN，上限 5000 护栏） */
  drugNameLike?: string;
  /** 药品编码（pham_std_code），精确匹配 */
  drugCode?: string;
  /** 批次号，精确匹配；传 '-' 查无批次数据 */
  batchNumber?: string;
  /** 二级科室/药箱 code，精确匹配 */
  secondDeptCode?: string;
  /** '1' 药箱 / '0' 非药箱（字符串） */
  isMedicineBox?: IsMedicineBox;
  /** 有效期起，格式 2026-01-01T00:00:00 */
  expiryBegin?: DateTimeISO;
  /** 有效期止，同上 */
  expiryEnd?: DateTimeISO;
  /**
   * OR 模糊匹配 drugCode / pharmacyCode / batchNumber / phamFactoryName 四列
   * ⚠️ 不含药品名称（名称是 mdm 回填字段非表字段），placeholder 需写清
   */
  keyword?: string;
}

/** GET /pharmacy-drug-stock/stats 入参 */
export interface DrugStockStatsParams {
  /** 租户ID（必传！） */
  miId: number;
  /** 按药房过滤统计口径 */
  pharmacyCode?: string;
}

// ==================== 出参类型 ====================

/**
 * 库存列表行（PharmacyDrugStockListVO，16 字段）
 * 与后端 VO 逐字段对齐，勿增删改字段名
 */
export interface DrugStockListVO {
  /** 库存主键 */
  id: number;
  /** 药房 code（暂无名称回填，翻译归 P3） */
  pharmacyCode: string;
  /** t_dept 回填药房名称：详情接口返回；page-grouped 子行恒 null（渲染 '-'，勿丢行） */
  pharmacyName: string | null;
  /** 药品名称（mdm 批查回填，可能 null → 渲染 '-'） */
  drugName: string | null;
  /** 药品规格（同上，可能 null → 渲染 '-'） */
  drugSpec: string | null;
  /** 药品编码 */
  drugCode: string;
  /** 库存数量（0 是合法在库值，勿过滤） */
  currentInventory: number;
  /** 基本单位 */
  drugUnit: string;
  /** 包装单位 */
  packageUnit: string;
  /** 零售包装因子（1 包装 = N 基本单位） */
  retailFactor: number;
  /** 批次号，'-' = 无批次 → 渲染「无批次」标签 */
  batchNumber: string;
  /** 生产日期，ISO：2025-06-01T00:00:00 */
  productionDate: DateTimeISO;
  /** 有效期，ISO；'2099-12-30T00:00:00' = 长期 → 渲染「长期」标签 */
  expiryDate: DateTimeISO;
  /** 厂家名称 */
  phamFactoryName: string;
  /** '1' 药箱 / '0' 非药箱（注意是字符串，不是数字） */
  isMedicineBox: IsMedicineBox;
  /** 二级科室/药箱 code（暂无名称回填，翻译归 P3） */
  secondDeptCode: string;
  /** 创建时间，ISO */
  createTime: DateTimeISO;
}

/**
 * 追溯码实例（DrugInstanceListVO，9 字段，详情接口返回）
 */
export interface DrugInstanceListVO {
  /** 实例主键 */
  id: number;
  /**
   * 追溯码 ⚠️ 全链路 String！
   * 20 位纯数字超 JS 安全整数，且存在 '-1' 后缀形态
   * 禁止 parseInt / Number() / toFixed；渲染用等宽字体防换行截断
   */
  barcode: string;
  /** 打印状态：0 未打印 / 1 已打印 / 2 已作废（只读） */
  status: PrintStatus;
  /** 码状态：0 正常 / 1 作废 / 2 已配置 / 3 已过期 / 4 已执行 / 5 已报损（只读） */
  drugUnitStatus: DrugUnitStatus;
  /** 最近打印时间，可 null */
  printTime: DateTimeISO | null;
  /** 作废原因 */
  cancelReason: string | null;
  /** 批次号，'-' = 无批次 */
  batchNo: string;
  /** 有效期，纯日期：2026-05-20（⚠️ 与库存表 DateTimeISO 是两种格式，dayjs 均可直接解析） */
  expiredTime: DateOnly;
  /** 生产日期，纯日期，同上 */
  productionDate: DateOnly;
}

/**
 * 库存详情（DetailVO）= 列表行全字段 + 追溯码实例
 */
export interface DrugStockDetailVO extends DrugStockListVO {
  /** 追溯码实例数组，可为空数组 → 展示空态而非报错 */
  traceabilityInstances: DrugInstanceListVO[];
}

/**
 * 统计四指标（GET /pharmacy-drug-stock/stats 出参，裸返 Map）
 */
export interface DrugStockStats {
  /** 品种数（distinct drug_code） */
  drugKindsCount: number;
  /** 库存总量（sum current_inventory，空表为 0） */
  totalInventory: number;
  /** 临期品种数（now ~ now+30天，2099 长期天然排除；阈值 30 天待业务确认，卡片文案暂写「30天内临期」） */
  nearExpiryKindsCount: number;
  /** 药箱库存记录数（is_medicine_box='1'） */
  medicineBoxRecordCount: number;
}

// ==================== 分页结构（裸返 IPage） ====================

/**
 * 分页裸返：核心五键 records/total/size/current/pages
 * 可能附带 orders 等冗余键，忽略即可（实际响应多余键不影响 TS 结构类型）
 */
export interface IPage<T> {
  records: T[];
  total: number;
  size: number;
  current: number;
  pages: number;
}
// ==================== API 层（基于 bizRequest，裸返直透） ====================

/**
 * miId 守卫：缺 miId 本地拦截，不发请求
 * 对应后端 B 方案守卫（500「租户ID不能为空」），提前一层拦截省一次往返
 */
function assertMiId(): number {
  const miId = getMiId();
  if (miId === undefined || miId === null) {
    throw new Error('租户ID不能为空（前端拦截）');
  }
  return miId;
}

/** 页面调用用的入参类型（miId 由 API 层自动注入，调用方不传） */
export type DrugStockPageQuery = Omit<DrugStockPageParams, 'miId'>;
export type DrugStockStatsQuery = Omit<DrugStockStatsParams, 'miId'>;

/**
 * 库存分页查询
 * GET /pharmacy-drug-stock/page → 裸返 IPage
 * ⚠️ 日期参数已是 ISO 带 T 字符串类型，TS 层面约束住，不会误传 Date 对象
 */
export async function getDrugStockPage(params: DrugStockPageQuery): Promise<DrugStockPageResult> {
  return bizRequest<DrugStockPageResult>('/api/pharmacy-drug-stock/page', {
    method: 'GET',
    params: { ...params, miId: assertMiId() },
  });
}

/** 统计四指标 GET /pharmacy-drug-stock/stats → 裸返 Map */
export async function getDrugStockStats(params: DrugStockStatsQuery = {}): Promise<DrugStockStats> {
  return bizRequest<DrugStockStats>('/api/pharmacy-drug-stock/stats', {
    method: 'GET',
    params: { ...params, miId: assertMiId() },
  });
}

/**
 * 库存详情（含追溯码实例）GET /pharmacy-drug-stock/{id} → 裸返 DetailVO
 * id 兼容 number | string（若联调发现是雪花 ID，调用侧直接透传字符串即可）
 */
export async function getDrugStockDetail(id: number | string): Promise<DrugStockDetailVO> {
  return bizRequest<DrugStockDetailVO>(`/api/pharmacy-drug-stock/${id}`, {
    method: 'GET',
    params: { miId: assertMiId() },
  });
}
/** 分组分页响应（IPage 结构，§2.4）：total = 组数 */
export interface DrugStockGroupPage {
  records: DrugStockGroupVO[];
  total: number;
  size: number;
  current: number;
  pages: number;
}

/** 分组 VO（§2.3，16 字段）——组头汇总一律直绑本类型字段，前端禁止重算 */
export interface DrugStockGroupVO {
  /** pharmacyCode|drugCode，组头 rowKey */
  groupKey: string;
  pharmacyCode: string;
  drugCode: string;
  /** t_dept 回填；无匹配 → null（前端显示 '-'，勿丢行） */
  pharmacyName: string | null;
  drugName: string | null;
  drugSpec: string | null;
  phamFactoryName: string | null;
  drugUnit: string;
  packageUnit: string | null;
  /** 1 packageUnit = retailFactor 个 drugUnit */
  retailFactor: number | null;
  batchCount: number;
  /** 库存合计（drugUnit 口径） */
  totalInventory: number;
  medBoxCount: number;
  /** 最近真实有效期（后端已排除 2099 与 null）；全长期 → null */
  nearestExpiry: string | null;
  allLongTerm: boolean;
  /** 组内全部批次（永不跨页拆组）；⚠️ 本接口中子行的 drugName/drugSpec/pharmacyName 恒 null */
  children: DrugStockListVO[];
}

/**
 * 分组分页（列表页主端点，§2.1-1）：size = 每页组数
 * request 写法与文件内 getDrugStockPage 保持一致，仅路径/返回类型不同
 */
export async function getDrugStockPageGrouped(
  params: DrugStockPageQuery & { page?: number; size?: number },
): Promise<DrugStockGroupPage> {
  return bizRequest<DrugStockGroupPage>('/api/pharmacy-drug-stock/page-grouped', {
    method: 'GET',
    params: { ...params, miId: assertMiId() },
  });
}

export type DrugStockPageResult = IPage<DrugStockListVO>;
