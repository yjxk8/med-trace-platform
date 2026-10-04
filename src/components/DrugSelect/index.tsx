import { Select, Spin } from 'antd';
import { useRef, useState } from 'react';
import type { DrugOption } from '@/services/drugInfos';
import { getDrugOptions } from '@/services/drugInfos';

interface DrugSelectProps {
  value?: DrugOption | null;
  onChange?: (v: DrugOption | null) => void;
  miId?: number;
  disabled?: boolean;
  placeholder?: string;
  limit?: number;
}

/**
 * 全局选药组件：走 /drug-infos/options（铁律⑦：勿用 /page 全量）
 * - 服务端搜索，keyword 300ms 防抖；默认仅出在用药品
 * - Form.Item 受控用法：value/onChange 传整个药品对象
 *   取值：form.getFieldValue('drug') → { id, phamCode, phamName, retailPrice, ... }
 */
const DrugSelect: React.FC<DrugSelectProps> = ({
  value,
  onChange,
  miId,
  disabled,
  placeholder = '输入药品名称/编码搜索',
  limit = 20,
}) => {
  const [options, setOptions] = useState<DrugOption[]>([]);
  const [fetching, setFetching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const seqRef = useRef(0); // 竞态保护：只采纳最后一次请求的结果

  const fetchOptions = (keyword: string) => {
    const seq = ++seqRef.current;
    setFetching(true);
    getDrugOptions({ keyword: keyword || undefined, miId, limit })
      .then((list) => seq === seqRef.current && setOptions(list || []))
      .catch(() => seq === seqRef.current && setOptions([]))
      .finally(() => seq === seqRef.current && setFetching(false));
  };

  const onSearch = (kw: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchOptions(kw.trim()), 300);
  };

  return (
    <Select
      showSearch
      allowClear
      disabled={disabled}
      value={value?.phamCode}
      placeholder={placeholder}
      defaultActiveFirstOption={false}
      filterOption={false}
      onSearch={onSearch}
      onFocus={() => {
        if (!options.length) fetchOptions('');
      }}
      onClear={() => onChange?.(null)}
      onChange={(_, opt) => {
        const o = Array.isArray(opt) ? opt[0] : (opt as any);
        onChange?.(o?.id !== undefined ? (o as DrugOption) : null);
      }}
      notFoundContent={fetching ? <Spin size="small" /> : null}
      options={options.map((o) => ({
        ...o, // 展开原始字段，选中后 opt 即完整药品对象
        value: o.phamCode,
        label: `${o.phamName}（${o.phamCode}）${o.phamSpec ? ` ${o.phamSpec}` : ''}`,
      }))}
    />
  );
};

export default DrugSelect;
