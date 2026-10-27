/**
 * DeptSelect 部门选择器 —— 组织架构数据源（GET /dept/tree），供业务模块（转科/处方/库存等）使用
 * - miId 缺省取当前机构（getMiId()）；跨机构场景显式传入
 * - deptStatus 缺省 1（仅启用节点）；需含禁用节点传 undefined
 * - 以部门 id 为值；药房「按 deptCode 取值」场景沿用 services/dept.ts 的 listPharmacyOptions
 * - 挂载即拉取不缓存（铁律②）；失败保留空选项，重开可重试
 */
import { TreeSelect } from 'antd';
import { type CSSProperties, useEffect, useState } from 'react';
import { type DeptTreeNode, getDeptTree } from '@/services/org/dept';
import { getMiId } from '@/services/tenant';

interface DeptOption {
  title: string;
  value: number;
  children?: DeptOption[];
}

function toOptions(nodes: DeptTreeNode[]): DeptOption[] {
  return nodes.map((n) => ({
    title: n.deptCode ? `${n.deptName}（${n.deptCode}）` : n.deptName,
    value: n.id,
    children: n.children?.length ? toOptions(n.children) : undefined,
  }));
}

interface Props {
  value?: number | null;
  onChange?: (v: number | undefined) => void;
  miId?: number; // 缺省当前机构
  deptStatus?: number; // 缺省 1 仅启用
  allowClear?: boolean; // 默认 true（业务选择器可清空走默认）
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
}

export default function DeptSelect({
  value,
  onChange,
  miId,
  deptStatus = 1,
  allowClear = true,
  placeholder,
  disabled,
  style,
}: Props) {
  const [options, setOptions] = useState<DeptOption[]>([]);
  const [loading, setLoading] = useState(false);
  const effectiveMiId = miId ?? getMiId() ?? undefined;

  useEffect(() => {
    if (effectiveMiId == null) return;
    let alive = true;
    setLoading(true);
    getDeptTree({ miId: effectiveMiId, deptStatus })
      .then((tree) => {
        if (alive) setOptions(toOptions(tree ?? []));
      })
      .catch(() => {
        /* 拉取失败保留空选项 */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [effectiveMiId, deptStatus]);

  return (
    <TreeSelect
      value={value ?? undefined}
      onChange={(v) => onChange?.(v)}
      treeData={options}
      loading={loading}
      disabled={disabled}
      allowClear={allowClear}
      showSearch
      treeNodeFilterProp="title"
      placeholder={placeholder ?? '选择部门'}
      notFoundContent={loading ? '加载中…' : '暂无部门'}
      style={style ?? { width: '100%' }}
    />
  );
}
