/**
 * 左侧分组配置（与 dict_type.type 枚举同源）
 * 已确认：2=院内、3=平台；国标/行标 对应 type 值【待后端确认】（暂占位 0/1，确认后只改这里）
 */
export const SCOPE_META: { value: string; label: string }[] = [
  { value: '0', label: '国标' },
  { value: '1', label: '行标' },
  { value: '3', label: '平台' },
  { value: '2', label: '院内' },
];
