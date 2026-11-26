/**
 * 药品模块字典编码注册表（按 mdm_dict_type.csv 实际编码定版，2026-11-26）
 * ⚠️ 集中注册：SaveForm 下拉与列表翻译消费同一份，换码只改本文件
 * ⚠️ 业务表只存字典 value（硬性契约）；历史自由文本存量值无匹配时原样回显
 */
/** 剂型（平台，CSV id 2904；⚠️ 备选 id 3010 code=dosage_form「剂型(平台)」——
 *  两者核对 items 数量后二选一，只改本行） */
export const DRUG_DICT_DOSAGE_FORM = 'PT0.2.11';
/** 单位（平台，CSV id 2917）——列表存量 value 即 G10/G21 等代码，翻译后显示名称 */
export const DRUG_DICT_UNIT = 'YN0.2.0';
/** 毒理分类（机构级「毒麻药品类型的毒理分类集合」，CSV id 2981/2982）⚠️
 *  mi_id=12 那条 status=1 已停用 → 12 机构下拉为空；需后端恢复或建平台级【待确认】 */
export const DRUG_DICT_TOXICOLOGY = 'YN0.3.1';
/** 质量单位（机构级「药品质量单位」，CSV id 2985 mi_id=12）⚠️ 仅 12 机构有效，
 *  其他机构需自建同码 type=2 字典 */
export const DRUG_DICT_QUALITY_UNIT = 'YN0.3.23';

export const DRUG_DICT = {
  toxicology: DRUG_DICT_TOXICOLOGY,
  dosageForm: DRUG_DICT_DOSAGE_FORM,
  unit: DRUG_DICT_UNIT,
  qualityUnit: DRUG_DICT_QUALITY_UNIT,
} as const;

/** 待建字典（CSV 无对应类型，暂回退文本框，后端建好在此登记+SaveForm 换 DictSelect）：
 *  - 体积单位（ml/L）
 *  - 费用记账方式
 */
