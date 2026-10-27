/**
 * MenuTreeSelect 父级菜单树形下拉（v2 §6.5）
 * 数据源 GET /menu/tree（全量，无筛选参数）；菜单量小，进组件拉一次，不做长缓存（§6.5）
 * - 顶部固定「顶级菜单(0)」伪节点：配合 §6.1 parentId 恒有值（0=顶级一级目录）
 * - excludeId（编辑态）：过滤自身及整棵子树——防循环引用（后端兜底，前端禁选更友好）
 * - 后续 RBAC 授权树可复用（加 multiple/checkable 扩展位）
 */
import { TreeSelect } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { getMenuTree, type MenuTreeVO } from '@/services/org/menu';

interface Props {
  value?: number | null;
  onChange?: (v: number | undefined) => void;
  /** 编辑态：需要从树中剔除的节点 id（自身），其子树随之隐藏 */
  excludeId?: number | null;
  placeholder?: string;
  disabled?: boolean;
}

const TOP_NODE = { value: 0, title: '顶级菜单（作为一级目录）' }; // v2：无应用节点概念

/** 从整树中找出 id 命中节点及其全部子孙 id */
function collectSubtreeIds(
  nodes: MenuTreeVO[],
  target: number,
  out: Set<number>,
): boolean {
  for (const n of nodes) {
    if (n.id === target) {
      const walk = (x: MenuTreeVO) => {
        out.add(x.id);
        (x.children ?? []).forEach(walk);
      };
      walk(n);
      return true;
    }
    if (n.children?.length && collectSubtreeIds(n.children, target, out))
      return true;
  }
  return false;
}

export default function MenuTreeSelect({
  value,
  onChange,
  excludeId,
  placeholder,
  disabled,
}: Props) {
  const [tree, setTree] = useState<MenuTreeVO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMenuTree()
      .then((t) => {
        if (alive) setTree(t);
      })
      .catch(() => {
        /* 拉取失败保留空树 */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const treeData = useMemo(() => {
    const exclude = new Set<number>();
    if (excludeId != null) collectSubtreeIds(tree, excludeId, exclude);
    const toData = (
      nodes: MenuTreeVO[],
    ): { value: number; title: string; children: any[] }[] =>
      nodes
        .filter((n) => !exclude.has(n.id))
        .map((n) => ({
          value: n.id,
          title: n.name,
          children: toData(n.children ?? []),
        }));
    return [{ ...TOP_NODE, children: toData(tree) }];
  }, [tree, excludeId]);

  return (
    <TreeSelect<number>
      value={value ?? undefined}
      onChange={(v) => onChange?.(v)}
      treeData={treeData as any}
      loading={loading}
      disabled={disabled}
      showSearch
      treeNodeFilterProp="title"
      treeDefaultExpandAll
      // ⚠️ 不允许清空：§6.1 编辑必须始终有 parentId（清空会被误当「不改」或误移顶级）
      allowClear={false}
      placeholder={placeholder ?? '选择父级菜单'}
      notFoundContent={loading ? '加载中…' : '暂无菜单'}
      style={{ width: '100%' }}
    />
  );
}
