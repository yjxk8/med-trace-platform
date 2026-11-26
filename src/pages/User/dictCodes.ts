/**
 * 用户模块字典编码注册表（遗留#2 落地 · 编码来源 mdm_dict_type.csv 平台级字典核对）
 * ⚠️ 集中注册：表单（UserFormModal）与列表/CopyPermission 翻译（index.tsx）消费同一份，
 *    换码/换字典只改本文件；散落多处必漂移
 * ⚠️ 遗留编码含大写与点号（历史导入），不满足新增类型正则 ^[a-z][a-z0-9_]*$——
 *    仅新增/修改类型时校验；读取侧 /dict/type/{dictType} 不校验（后端已确认）
 */
/** 学历（平台，CSV id 2908） */
export const USER_DICT_EDUCATION = 'PT0.2.15';
/** 岗位（平台，CSV id 2902）——表单 label 由「岗位/职称」收敛为「岗位」 */
export const USER_DICT_POST = 'PT0.2.1';
/** 职称（平台，CSV id 2909）——覆盖原「医师级别」语义（CSV 无该类型，职称最贴近）【待产品确认】 */
export const USER_DICT_LEVEL = 'PT0.2.16';

export const USER_DICT = {
  education: USER_DICT_EDUCATION,
  post: USER_DICT_POST,
  level: USER_DICT_LEVEL,
} as const;

/**
 * 待建字典类型（后端建好在此登记，表单 Input→DictSelect、列表列→翻译 Map）：
 * - workNature 工作性质 / skill 擅长领域：CSV 无对应类型
 * - prescClass 处方类别 / sex 性别：现为本地常量；国标值域口径需先核对存量数据，暂不迁
 */
