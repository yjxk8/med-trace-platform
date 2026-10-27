/**
 * 左侧字典类型树：分组（国标/行标/平台/院内）→ 类型项（编辑/删除图标内嵌）
 * 客户端过滤：名称/编码即时筛选，命中分组自动展开；停用类型置灰仍可见（口径待业务确认）
 */
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Button, Empty, Input, Spin, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { Key } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { DictTypeVO } from '@/services/dict';
import { SCOPE_META } from './constants';
import { isOn } from './shared';

interface Props {
  types: DictTypeVO[];
  loading: boolean;
  selected: DictTypeVO | null;
  onSelect: (t: DictTypeVO) => void;
  onAdd: () => void;
  onEdit: (t: DictTypeVO) => void;
  onDelete: (t: DictTypeVO) => void;
}

export default function TypeTree({
  types,
  loading,
  selected,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [expanded, setExpanded] = useState<Key[]>([]);

  const treeData: DataNode[] = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const hit = (t: DictTypeVO) =>
      !kw ||
      String(t.dictName ?? '')
        .toLowerCase()
        .includes(kw) ||
      String(t.dictCode ?? '')
        .toLowerCase()
        .includes(kw);

    return SCOPE_META.map((g) => ({
      key: `g:${g.value}`,
      title: <b>{g.label}</b>,
      selectable: false, // 分组节点不参与选中
      children: types
        .filter((t) => String(t.type) === g.value && hit(t))
        .map((t) => ({
          key: `t:${t.id}`,
          title: (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span
                title={`${t.dictName}（${t.dictCode}）`}
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: isOn(t.status) ? 'inherit' : '#bfbfbf', // 停用置灰
                }}
              >
                {t.dictName}
              </span>
              <span
                style={{ flexShrink: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  type="text"
                  size="small"
                  title="编辑"
                  icon={<EditOutlined style={{ color: '#8c8c8c' }} />}
                  onClick={() => onEdit(t)}
                />
                <Button
                  type="text"
                  size="small"
                  title="删除"
                  icon={<DeleteOutlined style={{ color: '#8c8c8c' }} />}
                  onClick={() => onDelete(t)}
                />
              </span>
            </span>
          ),
        })),
    }));
  }, [types, keyword, onEdit, onDelete]);

  // 搜索时自动展开有命中的分组
  useEffect(() => {
    if (!keyword.trim()) return;
    setExpanded(
      treeData.filter((g) => (g.children?.length ?? 0) > 0).map((g) => g.key),
    );
  }, [keyword]); // eslint-disable-line react-hooks/exhaustive-deps

  // 选中类型所在分组保持展开（含新增后自动选中的新类型）
  useEffect(() => {
    if (!selected) return;
    const gk = `g:${String(selected.type)}`;
    setExpanded((prev) => (prev.includes(gk) ? prev : [...prev, gk]));
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        background: '#fff',
        borderRadius: 8,
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>字典</span>
        <Button
          size="small"
          icon={<PlusOutlined />}
          title="新增字典类型"
          onClick={onAdd}
        />
      </div>
      <Input
        allowClear
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        placeholder="请输入字典名称或代码"
        onChange={(e) => setKeyword(e.target.value)}
        style={{ marginBottom: 12, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Spin spinning={loading}>
          {types.length === 0 && !loading ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无字典类型"
            />
          ) : (
            <Tree
              blockNode
              treeData={treeData}
              selectedKeys={selected ? [`t:${selected.id}`] : []}
              expandedKeys={expanded}
              onExpand={(keys) => setExpanded(keys)}
              onSelect={(keys) => {
                const key = String(keys[0] ?? '');
                if (!key.startsWith('t:')) return;
                const t = types.find((x) => x.id === Number(key.slice(2)));
                if (t) onSelect(t);
              }}
            />
          )}
        </Spin>
      </div>
    </div>
  );
}
