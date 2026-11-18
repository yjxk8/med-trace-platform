/**
 * UserRemoteSelect：用户远程模糊检索单选（麻精权限链路 Modal 用）—— 反馈⑨
 * 数据源 pageUser：keyword 服务端模糊匹配 姓名/账号/手机号/拼音码（v3 契约），
 * 根治 fetchUserOptions 上限 50 的检索盲区；展示「姓名（账号）」，值为 userId；
 * 受控组件（value/onChange），可直接放入 Form.Item；监管链路跨机构查询默认不传 miId
 */
import { Empty, Select, Spin } from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  getUserDetail,
  pageUser,
  USER_STATUS,
  type UserVO,
} from '@/services/org/user';

interface Props {
  value?: number;
  onChange?: (v?: number) => void;
  miId?: number; // 选填；不传 = 全平台检索（区域监管口径）
  placeholder?: string;
}

const toOption = (u: UserVO) => ({
  value: u.id,
  label: `${u.name}（${u.account}）`,
});

export default function UserRemoteSelect({
  value,
  onChange,
  miId,
  placeholder,
}: Props) {
  const [options, setOptions] = useState<{ value: number; label: string }[]>(
    [],
  );
  const [fetching, setFetching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const search = (kw: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setFetching(true);
      pageUser({
        keyword: kw || undefined,
        status: USER_STATUS.NORMAL, // 仅正常用户，与 /user/options 口径一致
        ...(miId ? { miId } : {}),
        page: 1,
        size: 20,
      })
        .then((r) => setOptions((r.records ?? []).map(toOption)))
        .catch(() => setOptions([]))
        .finally(() => setFetching(false));
    }, 300);
  };

  // 回显兜底：value 有值但不在当前 options（如从审计行带入）→ 拉详情拼 label
  useEffect(() => {
    if (value == null) return;
    if (options.some((o) => o.value === value)) return;
    getUserDetail(value)
      .then((u) =>
        setOptions((prev) =>
          prev.some((o) => o.value === value) ? prev : [toOption(u), ...prev],
        ),
      )
      .catch(() => {}); // 已删用户：保留裸值，不阻塞
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Select
      showSearch
      allowClear
      value={value}
      onChange={(v) => onChange?.(v)}
      onSearch={search}
      onClear={() => search('')}
      onOpenChange={(open) => {
        if (open && !options.length) search(''); // 首次展开给默认候选
      }}
      filterOption={false} // 搜索走服务端，禁用本地过滤
      loading={fetching}
      options={options}
      placeholder={placeholder ?? '输入姓名 / 账号 / 拼音码检索'}
      notFoundContent={
        fetching ? (
          <Spin size="small" />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="未找到匹配用户"
          />
        )
      }
    />
  );
}
