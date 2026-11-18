/**
 * 跨模块复用数据源(R1 单一来源收口 ★A4)
 * ⚠️ 本文件原含 fetchUserOptions(/user/options,上限 50 条)与 services/org/user.ts 重复定义,
 * 已删除重复版,改为从 user.ts 兼容 re-export:
 * - 现有引用方 import 路径零改动即可编译(签名兼容 {miId?, keyword?});
 * - 新代码请直接从 '@/services/org/user' 导入;选人场景一律 pageUser + UserRemoteSelect
 *   (/user/options 已弃用,上限 50 条,见 user.ts 内 JSDoc);
 * - 部门树 → services/org/dept.ts(getDeptTree,miId 必传)。
 * 后续 grep '@/services/org/common' 的引用全部迁移后,删除本文件。
 */
export { fetchUserOptions, type UserOptionVO } from '@/services/org/user';
