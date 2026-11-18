/**
 * 成员管理 Drawer（P0 核心）—— 方案 §4.3
 * 顶部组摘要（名称/编码/麻精 Tag/到期 Tag）→ 筛选（keyword + deptId 部门选择）
 * → 成员表（ghost 行「已注销用户」占位、禁勾）→ rowSelection 批量移出
 * 成员变更后 onMembersChanged() → 父列表刷新 memberCount
 *
 * 数据源：复用存量 getDeptTree（签名 { miId, deptStatus? }）；
 * 部门筛选项 = 树递归拍平（含各级子部门，禁用置灰）。
 * ⚠️ rowKey 为 u{userId}/g{绑定行id} 防撞前缀——批量移出前必须剥前缀取真实 userId
 * （直接 Number('u5') = NaN，已修）。
 */
import { PlusOutlined } from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
  App,
  Button,
  Drawer,
  Input,
  Modal,
  Space,
  Tooltip,
  TreeSelect,
} from 'antd';
import type { Key } from 'react';
import { useEffect, useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import { type DeptTreeNode, getDeptTree } from '@/services/org/dept';
import {
  batchRemoveMembers,
  fetchMembersPage,
  type MemberVO,
  type UserGroupVO,
} from '@/services/org/userGroup';
import MemberAddModal from './MemberAddModal';
import {
  fmtFull,
  JOIN_SOURCE_MAP,
  renderNarcotic,
  renderValidToCell,
} from './shared';
import './index.less';

interface Props {
  open: boolean;
  group: UserGroupVO | null;
  onClose: () => void;
  onMembersChanged: () => void;
}

const S = (v: string | number | null | undefined) => String(v ?? '');

export default function MemberDrawer({
  open,
  group,
  onClose,
  onMembersChanged,
}: Props) {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [deptId, setDeptId] = useState<number | undefined>(undefined);
  const filterRef = useRef<{ keyword?: string; deptId?: number }>({});
  const [deptTree, setDeptTree] = useState<
    { title: string; value: number; disabled?: boolean }[]
  >([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  /** 成员总数以分页请求为准（group.memberCount 增删后不随 prop 刷新） */
  const [memberTotal, setMemberTotal] = useState(0);

  useEffect(() => {
    if (!open || !group) return;
    setKeyword('');
    setDeptId(undefined);
    filterRef.current = {};
    setSelectedRowKeys([]);
    setMemberTotal(0);
    getDeptTree({ miId: Number(group.miId) })
      .then((t) => {
        // 递归拍平：树 → TreeSelect 平铺选项（含各级子部门；禁用置灰）
        const flat: { title: string; value: number; disabled?: boolean }[] = [];
        const walk = (nodes: DeptTreeNode[]): void => {
          nodes.forEach((d) => {
            flat.push({
              title: d.deptName,
              value: d.id,
              disabled: String(d.deptStatus) === '2',
            });
            if (d.children?.length) walk(d.children);
          });
        };
        walk(t);
        setDeptTree(flat);
      })
      .catch((e) => message.error((e as Error).message));
  }, [open, group]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = () => {
    filterRef.current = { keyword: keyword.trim() || undefined, deptId };
    actionRef.current?.reloadAndRest?.();
  };

  const doReset = () => {
    setKeyword('');
    setDeptId(undefined);
    filterRef.current = {};
    actionRef.current?.reloadAndRest?.();
  };

  const removeMembers = (ids: number[]) => {
    if (!group?.id || ids.length === 0) return;
    Modal.confirm({
      title: `移出 ${ids.length} 名成员？`,
      content: '移出后成员与该组解绑（物理删除成员关系），确定？',
      okText: '移出',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await batchRemoveMembers(group.id, ids);
          message.success(`已移出 ${res?.removed ?? ids.length} 名成员`);
          setSelectedRowKeys([]);
          actionRef.current?.reload();
          onMembersChanged(); // 父列表 memberCount 同步
        } catch (e) {
          message.error((e as Error).message);
          throw e;
        }
      },
    });
  };

  const columns: ProColumns<MemberVO>[] = [
    {
      title: '账号',
      dataIndex: 'account',
      width: '12%',
      render: (_, r) =>
        r.account || <span style={{ color: '#bfbfbf' }}>已注销用户</span>, // ghost 行占位
    },
    {
      title: '姓名',
      dataIndex: 'name',
      width: '10%',
      render: (_, r) =>
        r.name || <span style={{ color: '#bfbfbf' }}>已注销用户</span>,
    },
    {
      title: '岗位',
      dataIndex: 'post',
      width: '11%',
      ellipsis: true,
      render: (_, r) => r.post || '-',
    },
    {
      title: '部门',
      dataIndex: 'deptName',
      width: '12%',
      ellipsis: true,
      render: (_, r) => r.deptName || '-',
    },
    {
      title: '加入来源',
      dataIndex: 'joinSource',
      width: '10%',
      // ⚠️ 枚举待后端确认（反馈⑨）：映射不到显原文
      render: (_, r) =>
        JOIN_SOURCE_MAP[S(r.joinSource)] || S(r.joinSource) || '-',
    },
    {
      title: '加入时间',
      dataIndex: 'validFrom',
      width: '14%',
      ellipsis: true,
      render: (_, r) => fmtFull(r.validFrom),
    },
    {
      title: '成员失效时间',
      dataIndex: 'validTo',
      width: '14%',
      ellipsis: true,
      render: (_, r) => fmtFull(r.validTo),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: '13%',
      ellipsis: true,
      render: (_, r) => fmtFull(r.createTime),
    },
  ];

  return (
    <Drawer
      title={
        group ? (
          <Space size={8} wrap>
            <span>成员管理：{group.groupName}</span>
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              {group.groupCode}
            </span>
            {renderNarcotic(group.isNarcoticGroup)}
            {group.validTo && (
              <Tooltip title="组失效日期">
                {renderValidToCell(group.validTo)}
              </Tooltip>
            )}
          </Space>
        ) : (
          '成员管理'
        )
      }
      open={open}
      onClose={onClose}
      size={920}
      destroyOnHidden
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <Input
          allowClear
          style={{ width: 220 }}
          placeholder="姓名 / 账号 / 拼音码"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={doSearch}
        />
        <TreeSelect
          allowClear
          style={{ width: 200 }}
          placeholder="按部门筛选"
          treeData={deptTree}
          value={deptId}
          onChange={(v) => setDeptId(v)}
        />
        <Button type="primary" onClick={doSearch}>
          查询
        </Button>
        <Button onClick={doReset}>重置</Button>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ marginLeft: 'auto' }}
          onClick={() => setAddOpen(true)}
        >
          批量加入
        </Button>
        <Button
          danger
          disabled={selectedRowKeys.length === 0}
          onClick={() => {
            // 剥 u 前缀取真实 userId（ghost 行 g 前缀已禁勾，防御性过滤兜底）
            const ids = selectedRowKeys
              .map((k) => String(k))
              .filter((k) => k.startsWith('u'))
              .map((k) => Number(k.slice(1)))
              .filter((n) => !Number.isNaN(n));
            removeMembers(ids);
          }}
        >
          批量移出（{selectedRowKeys.length}）
        </Button>
      </div>
      <div className="member-fill">
        <FillTable
          pro
          search={false}
          options={{ reload: true, density: false, setting: false }}
          headerTitle={`成员列表（${memberTotal}）`}
          rowKey={(r: MemberVO) =>
            r.userId != null ? `u${r.userId}` : `g${r.id}`
          }
          actionRef={actionRef}
          columns={columns}
          tableLayout="fixed"
          pagination={{
            pageSize: 10,
            defaultPageSize: 10,
            showSizeChanger: false,
          }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
            // ghost 行 userId=null 无法参与 batch-remove（按 userIds）→ 禁勾【反馈⑩】
            getCheckboxProps: (r: MemberVO) => ({ disabled: r.userId == null }),
          }}
          request={async (params: { current?: number; pageSize?: number }) => {
            if (!group?.id) return { data: [], total: 0, success: false };
            try {
              const res = await fetchMembersPage(group.id, {
                page: params.current ?? 1,
                size: params.pageSize ?? 10,
                ...filterRef.current,
              });
              setMemberTotal(res.total);
              return { data: res.records, total: res.total, success: true };
            } catch (e) {
              message.error((e as Error).message);
              return { data: [], total: 0, success: false };
            }
          }}
        />
      </div>
      <MemberAddModal
        open={addOpen}
        group={group}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          actionRef.current?.reload();
          onMembersChanged();
        }}
      />
    </Drawer>
  );
}
