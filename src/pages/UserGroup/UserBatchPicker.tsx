/**
 * UserBatchPicker：批量选择成员（左右双栏）—— 反馈⑧
 * 数据源：pageUser（/api/user/page，v3 契约）—— keyword 服务端模糊匹配
 * 姓名/账号/手机号/拼音码，根治旧方案 fetchUserOptions 上限 50 + 本地过滤
 * 导致的「搜不到全部成员」；status=1 仅正常用户（与 /user/options 口径一致）；
 * miId 限定本机构候选（组归属机构的成员才可加入）。
 * ⚠️ pageUser 无 deptId 参数、UserVO 无 deptName 字段 → 不做部门过滤/科室列
 *   （后端支持后再加，不放不生效的过滤器）
 * 左：检索（防抖 300ms）+ 分页表格（跨页保留勾选）；右：已选（计数/过滤/移除/清空）
 * 受控组件：value/onChange；提交侧 value.map(u => u.id) 为 userIds，batch-add 契约不变
 */
import { App, Button, Empty, Input, Table, Tag } from 'antd';
import type { Key } from 'react';
import { useEffect, useRef, useState } from 'react';
import { pageUser, USER_STATUS, type UserVO } from '@/services/org/user';

export interface PickedUser {
  id: number;
  name: string;
  account?: string;
}

interface Props {
  miId: number;
  max?: number; // 上限，默认 200（与后端 batch-add 约束一致）
  value: PickedUser[];
  onChange: (v: PickedUser[]) => void;
}

export default function UserBatchPicker({
  miId,
  max = 200,
  value,
  onChange,
}: Props) {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState('');
  const [rows, setRows] = useState<UserVO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<Key[]>([]);
  const [rightFilter, setRightFilter] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  /** 服务端检索：keyword 姓名/账号/手机号/拼音码；status=1 仅正常用户；miId 本机构 */
  const load = (p: number, kw: string) => {
    if (!miId) return;
    setLoading(true);
    pageUser({
      miId,
      keyword: kw || undefined,
      status: USER_STATUS.NORMAL,
      page: p,
      size: 10,
    })
      .then((r) => {
        setRows(r.records ?? []);
        setTotal(r.total ?? 0);
      })
      .catch((e) => message.error((e as Error).message))
      .finally(() => setLoading(false));
  };

  // 初次加载（弹窗 destroyOnHidden，每次打开重新挂载即重置）
  useEffect(() => {
    load(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miId]);

  const onSearch = (kw: string) => {
    setKeyword(kw);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPage(1);
      load(1, kw);
    }, 300);
  };

  const pickedIds = new Set(value.map((u) => u.id));

  /** 勾选加入已选：去重 + 上限拦截 */
  const addChecked = () => {
    const adding = rows
      .filter((r) => checked.includes(r.id) && !pickedIds.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, account: r.account }));
    if (adding.length === 0) {
      setChecked([]);
      return;
    }
    if (value.length + adding.length > max) {
      message.warning(`一次最多 ${max} 人，当前已选 ${value.length} 人`);
      return;
    }
    onChange([...value, ...adding]);
    setChecked([]);
  };

  const removeOne = (id: number) => onChange(value.filter((u) => u.id !== id));

  const shownRight = value.filter((u) => {
    const kw = rightFilter.trim().toLowerCase();
    if (!kw) return true;
    return (
      u.name.toLowerCase().includes(kw) ||
      (u.account ?? '').toLowerCase().includes(kw)
    );
  });

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {/* ── 左：候选（服务端检索 + 分页） ── */}
      <div style={{ flex: 14, minWidth: 0 }}>
        <Input.Search
          placeholder="搜索姓名 / 账号 / 手机号 / 拼音码"
          allowClear
          enterButton
          onSearch={onSearch}
          onChange={(e) => {
            if (!e.target.value) onSearch('');
          }}
          style={{ marginBottom: 8 }}
        />
        <Table<UserVO>
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{
            current: page,
            total,
            pageSize: 10,
            size: 'small',
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 人`,
            onChange: (p) => {
              setPage(p);
              load(p, keyword);
            },
          }}
          rowSelection={{
            selectedRowKeys: checked,
            preserveSelectedRowKeys: true, // 跨页/跨搜索保留勾选
            onChange: setChecked,
            getCheckboxProps: (r) => ({ disabled: pickedIds.has(r.id) }),
          }}
          columns={[
            {
              title: '姓名',
              dataIndex: 'name',
              ellipsis: true,
              render: (v, r) =>
                pickedIds.has(r.id) ? (
                  <span>
                    <Tag color="blue" style={{ marginRight: 4 }}>
                      已选
                    </Tag>
                    {v}
                  </span>
                ) : (
                  v
                ),
            },
            { title: '账号', dataIndex: 'account', ellipsis: true, width: 120 },
            {
              title: '手机号',
              dataIndex: 'phone',
              width: 130,
              render: (v) => v || '—',
            },
          ]}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="未找到匹配用户，可换账号 / 手机号 / 拼音码再试"
              />
            ),
          }}
        />
      </div>

      {/* ── 中：加入 ── */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Button
          type="primary"
          disabled={!checked.length}
          onClick={addChecked}
          style={{ padding: '4px 10px' }}
        >
          加入{checked.length ? `(${checked.length})` : ''}
        </Button>
      </div>

      {/* ── 右：已选 ── */}
      <div
        style={{
          flex: 8,
          minWidth: 0,
          border: '1px solid #f0f0f0',
          borderRadius: 6,
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <span style={{ fontWeight: 600 }}>
            已选{' '}
            <span
              style={{ color: value.length >= max ? '#fa541c' : '#1677ff' }}
            >
              {value.length}
            </span>
            /{max}
          </span>
          <Button
            type="link"
            size="small"
            disabled={!value.length}
            onClick={() => onChange([])}
          >
            清空
          </Button>
        </div>
        <Input.Search
          placeholder="在已选内过滤"
          allowClear
          size="small"
          onSearch={setRightFilter}
          onChange={(e) => {
            if (!e.target.value) setRightFilter('');
          }}
          style={{ marginBottom: 8 }}
        />
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 320 }}>
          {shownRight.length === 0 && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="尚未选择成员"
            />
          )}
          {shownRight.map((u) => (
            <div
              key={u.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '3px 4px',
                borderRadius: 4,
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {u.name}（{u.account}）
              </span>
              <Button
                type="text"
                size="small"
                danger
                onClick={() => removeOne(u.id)}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
