/**
 * 租户上下文(miId)——单一事实源:utils/orgContext(登录/选机构/顶栏切换统一写入)
 * ⚠️ 历史:PLACEHOLDER_MI_ID=12 硬编码占位已废弃——曾导致「当前机构」读取恒为 12,本轮根治
 * 语义:getMiId()=登录时所选机构;平台级(type1 未选)→ null,调用方自行兜底或用 getMiIdRequired
 * ★调用方注意:getMiId 返回 number | null——传给 number 参数处写 getMiId() ?? 0 / ?? undefined;
 *   强依赖机构场景一律 getMiIdRequired()(未选机构显式报错,而非静默串机构)
 */
import { getOrgId } from '@/utils/orgContext';

/** 归一化内联(勿引 orgContext 私有 normalize——防 ReferenceError 复发) */
export function getMiId(): number | null {
  const raw = getOrgId();
  return raw != null && Number(raw) > 0 ? Number(raw) : null;
}

export function getMiIdRequired(): number {
  const miId = getMiId();
  if (miId == null) throw new Error('未选择机构,请先选择机构后再操作');
  return miId;
}
