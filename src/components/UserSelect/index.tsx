/**
 * UserSelect 用户选择器（v3 §六）
 * 数据源 GET /user/options（仅正常用户、上限50、姓名升序；keyword 匹配 姓名/账号/拼音码）
 * - 远程搜索防抖 300ms；首次加载不传 keyword；铁律②不做长缓存（进组件即拉一次）
 * - 展示「姓名（账号）」，post 作灰色副标签
 * - 回显兜底：value 不在当前 options 时拉 /user/detail/{id} 补一条（每 id 只补一次）
 * - 铁律①业务表单存 id + 姓名快照双字段：onChange(id, option) 已回传完整 option，
 *   调用方负责将 option.name 写入快照字段（历史单据回显不依赖该用户仍存在）
 * - 预留扩展位：麻精模块 prescClass/有效期内过滤，经 params 透传（接口参数位已留）
 */
import { Select, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  fetchUserOptions,
  getUserDetail,
  type UserOptionVO,
} from '@/services/user';

interface Props {
  value?: number | null;
  onChange?: (id: number | undefined, option: UserOptionVO | undefined) => void;
  /** 附加过滤（miId/tenantType/type…），内容变更即重拉 */
  params?: { miId?: number; tenantType?: string; type?: string };
  placeholder?: string;
  disabled?: boolean;
}

export default function UserSelect({
  value,
  onChange,
  params,
  placeholder,
  disabled,
}: Props) {
  const [options, setOptions] = useState<UserOptionVO[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const fallbackIds = useRef<Set<number>>(new Set()); // 已补过 detail 的 id，防重复拉取

  const load = async (keyword?: string) => {
    setLoading(true);
    try {
      setOptions(
        await fetchUserOptions({
          ...paramsRef.current,
          keyword: keyword || undefined,
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  // 进页面拉一次（铁律②）；依赖序列化串避免内联对象每渲染重拉
  const paramsKey = JSON.stringify(params ?? {});
  useEffect(() => {
    load();
  }, [paramsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSearch = (kw: string) => {
    setSearch(kw);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(kw.trim() || undefined), 300);
  };

  // 回显兜底：value 不在 options → detail 补一条（已删用户兜底失败仅占位，不打断表单）
  useEffect(() => {
    if (
      value == null ||
      options.some((o) => o.id === value) ||
      fallbackIds.current.has(value)
    )
      return;
    fallbackIds.current.add(value);
    let alive = true;
    getUserDetail(value)
      .then((u) => {
        if (!alive) return;
        setOptions((prev) =>
          prev.some((o) => o.id === value)
            ? prev
            : [
                {
                  id: u.id,
                  name: u.name,
                  account: u.account,
                  type: u.type,
                  post: u.post,
                },
                ...prev,
              ],
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value, options]);

  return (
    <Select<number>
      showSearch
      allowClear
      value={value ?? undefined}
      disabled={disabled}
      loading={loading}
      placeholder={placeholder ?? '选择用户'}
      defaultActiveFirstOption={false}
      filterOption={false}
      onSearch={onSearch}
      onBlur={() => {
        if (search) {
          setSearch('');
          load();
        }
      }}
      notFoundContent={loading ? '加载中…' : '暂无匹配用户'}
      onChange={(id, opt) => {
        const o = opt as (UserOptionVO & { value: number }) | undefined;
        onChange?.(
          id,
          o
            ? {
                id: o.value,
                name: o.name,
                account: o.account,
                type: o.type,
                post: o.post,
              }
            : undefined,
        );
      }}
      options={options.map((o) => ({
        value: o.id,
        label: `${o.name}（${o.account}）`,
        ...o,
      }))}
      optionRender={(opt) => (
        <div
          style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
        >
          <span>
            {opt.data.name}（{opt.data.account}）
          </span>
          {opt.data.post && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {opt.data.post}
            </Typography.Text>
          )}
        </div>
      )}
    />
  );
}
