/**
 * 字典模块常量（分组/状态/校验规则单一来源，防两处漂移）
 * 枚举定稿依据《关键点.md》§6.2
 */
export const SCOPE_META: { value: string; label: string }[] = [
  { value: '1', label: '国标' },
  { value: '2', label: '院内' },
  { value: '3', label: '平台' },
  { value: '4', label: '行标' },
];

/** 分组 → Tag 颜色（列表「所属分组」列用） */
export const SCOPE_TAG_COLOR: Record<string, string> = {
  '1': 'geekblue',
  '2': 'green',
  '3': 'purple',
  '4': 'cyan',
};

/** dictType 形态（§6.2 定稿）：'0' 实体 / '1' 映射；新增默认 '0' 且一般不暴露给用户改 */
export const DICT_TYPE_META: { value: string; label: string }[] = [
  { value: '0', label: '实体' },
  { value: '1', label: '映射' },
];

/** 状态 Select 选项（'0' 启用 / '1' 停用，与 shared.isOn 同源；启停接口入参为数字 0/1 —— 坑#3） */
export const STATUS_META: { value: string; label: string }[] = [
  { value: '0', label: '启用' },
  { value: '1', label: '停用' },
];

/** dictCode 校验正则（坑#1 后端约定） */
export const DICT_CODE_PATTERN = /^[a-z][a-z0-9_]*$/;

/** dictCode 保留词（坑#1：会字面命中管理路由 /type/page、/type/options 被遮蔽） */
export const DICT_CODE_RESERVED: readonly string[] = ['page', 'options'];
