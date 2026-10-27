/**
 * 提交载荷统一清洗（R2：cleanPayload 唯一来源）
 * 背景：后端不 normalize，空串会原样落库（列表 ""/null 混杂）；数字 0（menuType/parentId/isExternal 等）是合法值
 * 规则：
 * - undefined → 剔除
 * - 非 string → 原样保留（0 不吞）
 * - string → trim；trim 后为空 → 剔除（等价 null）
 * - 豁免按调用声明（豁免集是各模块契约的一部分，必须显式写出，禁止默默丢）：
 *   noTrim    —— 该键完全原样直传（如 user.account 区分大小写，空格属合法字符，Admin ≠ admin）
 *   keepEmpty —— 该键 trim 后为空仍提交 ""（如 mi-config 的 configValue ""=清空语义）
 */
export type CleanPayloadOptions = {
  noTrim?: string[];
  keepEmpty?: string[];
};

export function cleanPayload(
  data: Record<string, unknown>,
  opts: CleanPayloadOptions = {},
): Record<string, unknown> {
  const noTrim = new Set(opts.noTrim);
  const keepEmpty = new Set(opts.keepEmpty);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (typeof v !== 'string') {
      out[k] = v;
      continue;
    } // 数字 0 等合法值原样保留
    if (noTrim.has(k)) {
      out[k] = v;
      continue;
    } // 原样直传（不 trim 不剔除）
    const t = v.trim();
    if (t === '') {
      if (keepEmpty.has(k)) out[k] = ''; // 空串=清空语义键
      continue;
    }
    out[k] = t;
  }
  return out;
}
