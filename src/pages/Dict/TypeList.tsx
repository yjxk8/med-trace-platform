/**
 * 字典类型列表（左右结构·左侧主控面板 · 按来源分组树型展示）
 * 本次调整（用户要求①）：
 * - 按 type 枚举（1国标/2院内/3平台/4行标，SCOPE_META 定稿顺序）分组树型展示：
 *   组头可折叠、显示命中数量、滚动时吸顶；枚举外脏数据兜底进「未分组」组不丢行
 * - ★弃用左栏服务端分页，改为全量拉取 + 前端分组：
 *   服务端分页下每组跨页残缺（每页 20 条重新分组，组永远不完整）；
 *   类型量级为几百条，全量拉取（200/页 × 上限 10 页保护）换即时分组与即时搜索
 * - keyword/status 过滤改为前端过滤（口径与后端 keyword 语义一致：命中 dictName/dictCode，
 *   不区分大小写）；过滤后自动展开有命中的组，便于定位
 * 其余规约不变（平台行禁编辑删除、启停确认走独立接口、删除二次确认、4603/4601 差异化、
 * 写操作后 invalidate 清字典本地缓存）
 */
import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDict } from '@/hooks/useDict';
import {
  DICT_ERR,
  type DictTypeVO,
  deleteDictType,
  getBizCode,
  pageDictType,
  setDictTypeStatus,
} from '@/services/dict';
import { SCOPE_META, STATUS_META } from './constants';
import { isOn } from './shared';

/** 全量拉取参数：200/页 × 上限 10 页（>2000 条提示截断，正常量级远达不到） */
const FETCH_SIZE = 200;
const MAX_PAGES = 10;

/** 前端过滤口径（与后端 keyword 语义一致：命中 dictName/dictCode，不区分大小写） */
const matchFilter = (
  t: DictTypeVO,
  f: { keyword: string; status?: string },
) => {
  if (f.status != null && t.status !== f.status) return false;
  const kw = f.keyword.trim().toLowerCase();
  if (kw) {
    const name = (t.dictName ?? '').toLowerCase();
    const code = (t.dictCode ?? '').toLowerCase();
    if (!name.includes(kw) && !code.includes(kw)) return false;
  }
  return true;
};

interface Props {
  active: DictTypeVO | null;
  onSelect: (t: DictTypeVO | null) => void;
  onAdd: () => void;
  onEdit: (t: DictTypeVO) => void;
  /** 父级弹窗保存成功后自增，触发全量重拉 */
  reloadSignal: number;
}

export default function TypeList({
  active,
  onSelect,
  onAdd,
  onEdit,
  reloadSignal,
}: Props) {
  const { message } = App.useApp();
  const { invalidate } = useDict();

  // ===== 数据（全量 + 前端分组） =====
  const [allTypes, setAllTypes] = useState<DictTypeVO[]>([]);
  const [loading, setLoading] = useState(false);
  /** 已应用的过滤条件（查询/回车才提交，输入过程不触发） */
  const [applied, setApplied] = useState<{ keyword: string; status?: string }>({
    keyword: '',
  });
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  /** 组展开状态（key=type 值；首载默认展开非空组，之后尊重用户手动折叠） */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const activeIdRef = useRef<number | null>(null);
  activeIdRef.current = active?.id ?? null;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  /** 前端过滤结果 */
  const filtered = useMemo(
    () => allTypes.filter((t) => matchFilter(t, applied)),
    [allTypes, applied],
  );

  /** 按 SCOPE_META 定稿顺序（1国标/2院内/3平台/4行标）分组；枚举外兜底「未分组」不丢行 */
  const groupList = useMemo(() => {
    const ordered: { value: string; label: string; items: DictTypeVO[] }[] =
      SCOPE_META.map((s) => ({
        value: s.value,
        label: s.label,
        items: [],
      }));
    const byVal = new Map(ordered.map((g) => [g.value, g]));
    filtered.forEach((t) => {
      const g = byVal.get(String(t.type));
      if (g) g.items.push(t);
      else {
        let ex = ordered.find((x) => x.value === String(t.type));
        if (!ex) {
          ex = { value: String(t.type), label: '未分组', items: [] };
          ordered.push(ex);
        }
        ex.items.push(t);
      }
    });
    return ordered;
  }, [filtered]);

  /** 按分组顺序取第一条（首载自动选中，右栏立即可用） */
  const pickFirst = (list: DictTypeVO[]): DictTypeVO | null => {
    for (const s of SCOPE_META) {
      const found = list.find((t) => String(t.type) === s.value);
      if (found) return found;
    }
    return list[0] ?? null;
  };

  /** 全量拉取（分页循环取尽；选中行同步最新数据；首载自动选中 + 展开非空组） */
  const load = async () => {
    setLoading(true);
    try {
      const all: DictTypeVO[] = [];
      const first = await pageDictType({ page: 1, size: FETCH_SIZE }); // miId 由服务层注入
      all.push(...first.records);
      const pages = Number(first.pages ?? 1);
      for (let p = 2; p <= Math.min(pages, MAX_PAGES); p++) {
        const r = await pageDictType({ page: p, size: FETCH_SIZE });
        all.push(...r.records);
      }
      if (pages > MAX_PAGES) {
        message.warning(
          `字典类型超过 ${MAX_PAGES * FETCH_SIZE} 条，仅展示前 ${MAX_PAGES * FETCH_SIZE} 条`,
        );
      }
      setAllTypes(all);
      // 选中同步：首载自动选中第一条；已有选中则同步最新数据（改名/启停联动）
      if (activeIdRef.current == null) {
        const firstRow = pickFirst(all);
        if (firstRow) onSelectRef.current(firstRow);
      } else {
        const found = all.find((r) => r.id === activeIdRef.current);
        if (found) onSelectRef.current(found);
      }
      // 首次加载：默认展开非空组（仅初始化未设置过的 key，尊重用户后续手动折叠）
      const nonEmpty = new Set(all.map((t) => String(t.type)));
      setExpanded((prev) => {
        const next = { ...prev };
        SCOPE_META.forEach((s) => {
          if (!(s.value in next)) next[s.value] = nonEmpty.has(s.value);
        });
        return next;
      });
    } catch (e) {
      message.error((e as Error).message); // 500 → 原文；401 由拦截器跳登录
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [reloadSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 过滤提交（前端过滤，即时生效）；过滤后自动展开有命中的组便于定位 */
  const commit = (next: { keyword: string; status?: string }) => {
    setKeyword(next.keyword);
    setStatus(next.status);
    setApplied(next);
    const nonEmpty = new Set(
      allTypes.filter((t) => matchFilter(t, next)).map((t) => String(t.type)),
    );
    setExpanded((prev) => ({
      ...prev,
      ...Object.fromEntries([...nonEmpty].map((k) => [k, true])),
    }));
  };

  /** 启停（确认 → 独立接口 → 后端 message 轻提示 → 全量重拉保持选中） */
  const toggleStatus = (row: DictTypeVO) => {
    const next = isOn(row.status) ? 1 : 0;
    Modal.confirm({
      title:
        next === 1
          ? `停用字典类型「${row.dictName}」?`
          : `启用字典类型「${row.dictName}」?`,
      content:
        next === 1
          ? '停用后业务侧将不再提供该字典的下拉数据。'
          : '启用后恢复业务侧下拉数据。',
      okText: next === 1 ? '停用' : '启用',
      okButtonProps: next === 1 ? { danger: true } : undefined,
      onOk: async () => {
        try {
          const res = await setDictTypeStatus(row.id, next as 0 | 1);
          message.success(res?.message ?? (next === 1 ? '已停用' : '已启用'));
          invalidate(row.dictCode); // options 仅含启用类型，启停影响业务侧下拉缓存
          load();
        } catch (e) {
          message.error((e as Error).message);
          if (getBizCode(e) === DICT_ERR.TYPE_NOT_EXIST) {
            load(); // 4601：通常并发已删 → 重拉列表；不 throw（自动关确认框）
            return;
          }
          throw e;
        }
      },
    });
  };

  /** 删除（二次确认含"先清字典项"提示）；删选中项 → 通知父级清选 */
  const removeType = (row: DictTypeVO) => {
    Modal.confirm({
      title: `删除字典类型「${row.dictName}」?`,
      content:
        '删除后不可恢复;若该类型下已存在字典项,后端将拒绝删除(需先清空字典项)。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await deleteDictType(row.id);
          message.success(res?.message ?? '删除成功');
          invalidate(row.dictCode);
          if (row.id === activeIdRef.current) onSelectRef.current(null);
          load();
        } catch (e) {
          if (getBizCode(e) === DICT_ERR.TYPE_HAS_ITEMS) {
            message.error('该类型下存在字典项，请先删除字典项');
          } else {
            message.error((e as Error).message);
          }
          throw e;
        }
      },
    });
  };

  const toggleGroup = (key: string) =>
    setExpanded((p) => ({ ...p, [key]: !p[key] }));

  return (
    <>
      {/* 头部：标题 + 命中计数 + 刷新 + 新增 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          flexShrink: 0,
          gap: 4,
        }}
      >
        <span style={{ fontWeight: 600 }}>字典类型</span>
        <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
          共 {filtered.length} 条
        </span>
        <span style={{ flex: 1 }} />
        <Button
          type="text"
          size="small"
          title="刷新"
          icon={<ReloadOutlined style={{ fontSize: 14, color: '#8c8c8c' }} />}
          onClick={() => load()}
        />
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={onAdd}
        >
          新增
        </Button>
      </div>

      {/* 搜索区（keyword/status，前端即时过滤） */}
      <div
        style={{
          marginBottom: 8,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="名称/编码"
          value={keyword}
          // 输入过程不提交，回车/查询按钮才应用（与查询按钮语义一致）
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={() => commit({ keyword, status })}
        />
        <Space size={8}>
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 96 }}
            value={status}
            options={STATUS_META}
            onChange={(v) => commit({ keyword, status: v })}
          />
          <Button onClick={() => commit({ keyword, status })}>查询</Button>
          <Button
            onClick={() => {
              setKeyword('');
              setStatus(undefined);
              setApplied({ keyword: '' });
            }}
          >
            重置
          </Button>
        </Space>
      </div>

      {/* 分组树型列表（滚动容器；组头吸顶） */}
      <Spin
        spinning={loading}
        size="small"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              padding: '24px 0',
              textAlign: 'center',
              color: 'rgba(0,0,0,0.45)',
            }}
          >
            {allTypes.length === 0 ? '暂无字典类型' : '未找到匹配的字典类型'}
          </div>
        ) : (
          groupList.map((g) => {
            const open = !!expanded[g.value];
            return (
              <div key={g.value} style={{ marginBottom: 4 }}>
                {/* 组头：折叠箭头 + 组名 + 计数（吸顶） */}
                <div
                  onClick={() => toggleGroup(g.value)}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 2px',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <DownOutlined
                    rotate={open ? 0 : -90}
                    style={{
                      fontSize: 10,
                      color: '#999',
                      transition: 'transform .2s',
                    }}
                  />
                  <span style={{ fontWeight: 600 }}>{g.label}</span>
                  <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                    {g.items.length}
                  </span>
                </div>
                {open &&
                  (g.items.length === 0 ? (
                    <div
                      style={{
                        padding: '8px 12px',
                        fontSize: 12,
                        color: 'rgba(0,0,0,0.45)',
                      }}
                    >
                      暂无
                    </div>
                  ) : (
                    g.items.map((t) => {
                      const isActive = active?.id === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => onSelect(t)}
                          style={{
                            padding: '8px 10px',
                            marginBottom: 6,
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: isActive ? '#e6f4ff' : 'transparent',
                            borderLeft: `2px solid ${isActive ? '#1677ff' : 'transparent'}`,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontWeight: isActive ? 600 : 400,
                              }}
                            >
                              {t.dictName}
                            </span>
                            {t.platform && (
                              <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                                标准
                              </Tag>
                            )}
                            {!isOn(t.status) && (
                              <Tag style={{ marginInlineEnd: 0 }}>停用</Tag>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: 'rgba(0,0,0,0.45)',
                              marginTop: 2,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {t.dictCode}
                          </div>
                          {/* 行内操作区：阻断冒泡，不触发行选中 */}
                          <div
                            style={{
                              marginTop: 6,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Switch
                              size="small"
                              checked={isOn(t.status)}
                              onChange={() => toggleStatus(t)}
                            />
                            <span style={{ flex: 1 }} />
                            <Tooltip title="编辑">
                              <Button
                                type="text"
                                size="small"
                                style={{ padding: '0 4px' }}
                                icon={
                                  <EditOutlined
                                    style={{ color: '#8c8c8c', fontSize: 14 }}
                                  />
                                }
                                onClick={() => onEdit(t)}
                              />
                            </Tooltip>
                            <Tooltip title="删除">
                              <Button
                                type="text"
                                size="small"
                                danger
                                style={{ padding: '0 4px' }}
                                icon={
                                  <DeleteOutlined style={{ fontSize: 14 }} />
                                }
                                onClick={() => removeType(t)}
                              />
                            </Tooltip>
                          </div>
                        </div>
                      );
                    })
                  ))}
              </div>
            );
          })
        )}
      </Spin>
    </>
  );
}
