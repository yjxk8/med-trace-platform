/** 后端分页接口裸返回的 MyBatis-Plus IPage 结构（无 {code,data} 包装） */
export interface IPage<T> {
  records: T[];
  total: number;
  current: number;
  size: number;
}
