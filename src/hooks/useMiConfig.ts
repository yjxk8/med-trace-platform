/**
 * useMiConfig —— 机构参数配置读取 hook（契约 §九：业务方接入规范）
 * 后续任何模块的机构级配置（打印模板、水印开关、流程参数…）一律经此 hook 读取，
 * 禁止各自建配置字段/表；返回 reload 供「配置管理页保存后」手动刷新
 * - 底层 GET /mi-config/value；null = 未配置（200 正常分支 §6.3）→ 调用方 value ?? 默认值
 * - 不缓存结果：配置可能随时被管理员修改，消费方每次挂载拉取；也不长期缓存行 id（§6.1）
 * 用法：const { value: tplId, loading } = useMiConfig(getMiId(), 'print', 'template_id');
 *      渲染时 tplId ?? '8' 走默认值
 */
import { useCallback, useEffect, useState } from 'react';
import { getMiConfigValue } from '@/services/org/miConfig';

export function useMiConfig(
  miId: number | undefined,
  configType?: string,
  configName?: string,
) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0); // reload 触发器

  useEffect(() => {
    if (miId == null) {
      setValue(null);
      return;
    }
    let alive = true;
    setLoading(true);
    getMiConfigValue({ miId, configType, configName })
      .then((vo) => {
        if (alive) setValue(vo?.configValue ?? null);
      })
      .catch(() => {
        if (alive) setValue(null);
      }) // 拉取失败视同未配置，走默认值
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [miId, configType, configName, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { value, loading, reload };
}
