/**
 * 后端 IPage(mybatis-plus:{records,total,current,size,...})→ ProTable request 出参。
 * 用法:request={...ipageRequest(pageUser), ...}
 */
import type { IPage } from '@/utils/types';

export function ipageRequest<P extends Record<string, any>, T>(
  fn: (p: P & { page: number; size: number }) => Promise<IPage<T>>,
) {
  return async (params: P & { current?: number; pageSize?: number }) => {
    const {
      current = 1,
      pageSize = 20,
      current: _c,
      pageSize: _ps,
      ...rest
    } = params as any;
    const page = await fn({ ...rest, page: current, size: pageSize } as any);
    return { data: page.records ?? [], total: page.total ?? 0, success: true };
  };
}
