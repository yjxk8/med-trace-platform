/**
 * 机构参数配置 共享渲染 —— 契约：机构参数配置 v1 §6.4
 * 本模块无枚举字段（全自由文本），仅空名键展示与键标识组合两类共享逻辑
 */
import { Typography } from 'antd';
import dayjs from 'dayjs';
import type { MiConfigVO } from '@/services/org/miConfig';

export const fmtFull = (v?: string | null) =>
  v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-';

/** §6.4：configName='' 是合法键（类型级默认配置），渲染占位文案而非空白行 */
export function renderKeyName(name?: string | null) {
  return name ? (
    name
  ) : (
    <Typography.Text type="secondary">（类型默认）</Typography.Text>
  );
}

/** 「type / name」组合标识（删除确认、查重提示用；空名键同样有可读文案，避免 "/ " 尾巴外露 §6.5） */
export function keyLabel(r: Pick<MiConfigVO, 'configType' | 'configName'>) {
  return `${r.configType || 'default'} / ${r.configName || '（类型默认）'}`;
}
