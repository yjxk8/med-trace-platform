/**
 * MiParentSelect 父级机构下拉 —— 契约：医疗机构 v1 §6.3
 * 数据源 GET /mi/page（size=100；固定排序 parentId→id = 天然树序，按深度缩进渲染）
 * - includeTop（默认 true）：顶部「顶级机构(0)」选项——父级选择用（0=移到顶级 §一.4）；
 *   传 false 时即纯机构下拉，可复用为 mi-config 机构数据源（§6.6）
 * - excludeId（编辑态）：剔除自身及全部子孙（扁平数据 childMap 推导 §6.3），后端循环校验兜底
 * - allowClear=false：§6.3 编辑必须始终有 parentId（清空会被误当「不改」）
 * - 机构 >100 家时选项截断【§八#6 /mi/tree 未建；要标准 TreeSelect 或全量端点喊后端】
 */
import { Select } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { buildMiIndex, getMiPage, type MiVO } from '@/services/org/mi';

interface Props {
  value?: number | null;
  onChange?: (v: number | undefined) => void;
  /** 编辑态：需要剔除的节点 id（自身），其子树随之隐藏 */
  excludeId?: number | null;
  /** 是否包含「顶级机构」选项；父级选择=true，纯机构下拉=false */
  includeTop?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export default function MiParentSelect({
  value,
  onChange,
  excludeId,
  includeTop = true,
  placeholder,
  disabled,
}: Props) {
  const [records, setRecords] = useState<MiVO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMiPage({ size: 100 })
      .then((res) => {
        if (alive) setRecords(res.records);
      })
      .catch(() => {
        /* 拉取失败保留空选项，表单可重开重试 */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo(() => {
    const idx = buildMiIndex(records);
    const exclude = excludeId != null ? idx.subtreeIds(excludeId) : null;
    const list = records
      .filter((r) => !exclude?.has(r.id))
      .map((r) => {
        const d = idx.depthOf(r.id);
        return {
          value: r.id,
          label: `${'　'.repeat(d)}${d > 0 ? '└ ' : ''}${r.name}（${r.code}）`,
        };
      });
    return includeTop
      ? [{ value: 0, label: '顶级机构（一级机构）' }, ...list]
      : list;
  }, [records, excludeId, includeTop]);

  return (
    <Select<number>
      value={value ?? undefined}
      onChange={(v) => onChange?.(v)}
      options={options}
      loading={loading}
      disabled={disabled}
      showSearch
      optionFilterProp="label"
      allowClear={false}
      placeholder={placeholder ?? '选择父级机构'}
      notFoundContent={loading ? '加载中…' : '暂无机构'}
      style={{ width: '100%' }}
    />
  );
}
