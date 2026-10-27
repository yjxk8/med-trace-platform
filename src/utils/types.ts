/**
 * 通用类型（R1：IPage 唯一来源，全工程禁止本地重复声明）
 * 后端分页裸返回 MyBatis-Plus IPage：records/total/current/size 恒有值；
 * pages 等冗余键可能附带 → 声明为可选（结构类型下多余键不影响赋值，忽略即可）
 */
export interface IPage<T> {
  records: T[];
  total: number;
  current: number;
  size: number;
  pages?: number;
}
