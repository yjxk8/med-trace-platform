import { request } from '@umijs/max';
import type { IPage } from '@/utils/types';

export interface UserItem {
  id: number;
  uMiId: number;
  uName: string;
  uAccount: string;
  uPhone?: string;
  uType?: number;
  uStatus?: number;
  [key: string]: any;
}

/** 分页查询：Authorization 头自动附带，禁止手工拼 ?token= */
export async function pageUsers(params: {
  uMiId?: number;
  page: number;
  size: number;
}): Promise<IPage<UserItem>> {
  return request<IPage<UserItem>>('/api/user/page', { method: 'GET', params });
}
