/**
 * 租户上下文（miId）
 * ⚠️ 待补充 #2：miId 来源未定（候选：登录响应 user 里带出 / 全局配置 / 环境变量）
 * 现阶段硬编码占位 —— 接入租户上下文后只改本文件，业务代码禁止写死 miId 字面量
 * 注：CurrentUser 目前没有 miId 字段；若后端在登录响应补上，此处改为从 getCachedUser() 读
 */
const PLACEHOLDER_MI_ID = 12;

export function getMiId(): number {
  return PLACEHOLDER_MI_ID;
}
