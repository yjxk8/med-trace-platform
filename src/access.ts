import type { InitialState } from '@/app';
export default (initialState: InitialState) => {
  const p = initialState?.perm;
  return {
    login: !!initialState?.token,
    admin: !!p?.isAdmin,
    adminType1: p?.isAdmin && p?.adminType === 1,
    normal: !p?.isAdmin,
  };
};
