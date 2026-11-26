/**
 * 业务字典下拉组件（P0 公共层 · 文档§7）
 * - local（默认）：挂载即经 useDict 缓存拉全量（/type/{dictType}，sort 升序），客户端过滤；
 * - remote：onSearch 防抖 300ms 调 /api/dict/options（中文命中 label / 字母命中 pinyin，大小写不敏感）；
 * - platform 项追加「（标准）」后缀；value 即提交值（业务表只存 value 契约红线）。
 */
import { Select } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getDict } from '@/hooks/useDict';
import { type DictItemVO, getDictOptions } from '@/services/dict';

interface Props {
  dictCode: string;
  value?: string;
  onChange?: (v?: string) => void;
  /** local=全量缓存(默认) / remote=keyword 混搜 */
  mode?: 'local' | 'remote';
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}

const DEBOUNCE_MS = 300;

export default function DictSelect({
  dictCode,
  value,
  onChange,
  mode = 'local',
  placeholder,
  allowClear = true,
  disabled,
  style,
}: Props) {
  const [items, setItems] = useState<DictItemVO[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // local 模式：dictCode 变化/重挂载 → 拉全量（缓存命中即时返回）
  useEffect(() => {
    if (mode !== 'local' || !dictCode) {
      setItems([]);
      return;
    }
    let alive = true;
    setLoading(true);
    getDict(dictCode)
      .then((list) => {
        if (alive) setItems(list);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dictCode, mode]);

  // remote 模式：搜索防抖 300ms（组件卸载清理定时器）
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
  const handleSearch = (kw: string) => {
    if (mode !== 'remote' || !dictCode) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLoading(true);
      getDictOptions({ dictCode, keyword: kw || undefined })
        .then((list) => setItems(list))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
  };

  const options = useMemo(
    () =>
      items.map((o) => ({
        value: o.value,
        label: o.platform ? `${o.label}（标准）` : o.label,
      })),
    [items],
  );

  return (
    <Select
      showSearch
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? '请选择'}
      allowClear={allowClear}
      disabled={disabled || !dictCode}
      loading={loading}
      style={style}
      options={options}
      // local：客户端过滤；remote：服务端已滤，客户端关闭过滤（否则防抖期间误清结果）
      filterOption={
        mode === 'local'
          ? (input, opt) =>
              String(opt?.label ?? '')
                .toLowerCase()
                .includes(input.toLowerCase())
          : false
      }
      onSearch={mode === 'remote' ? handleSearch : undefined}
    />
  );
}
