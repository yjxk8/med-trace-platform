/**
 * 用户管理(列表页)—— 范式对齐「药品库存 / 字典管理 / 角色管理」:
 * PageFill 骨架 + 白卡 + FillTable(ProTable request 模式) + App.useApp message
 * 契约:v3 终版 + 批量操作四接口(2026-11-18 后端已落地)
 * ★2026-11-19 工具条/交互定版(⑩~⑲ 沿用:多选/两段式布局/防自锁/清选中/部分成功结果/
 *   单击行勾选双击编辑/⑲ 表体定高测量契约)
 * ★★遗留#2 已落地(本轮):「岗位」「职称/级别」两列字典翻译——
 *   batchTranslate 一次拉全量建 {value:label}(平台级字典与机构无关,挂载一次即可),
 *   列渲染同步匹配;未命中的历史自由文本原样回显;严禁列 formatter 逐行调 /translate(坑#9)
 */
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  ClusterOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { App, Button, Empty, Input, Modal, Select, Space, Tag } from 'antd';
import type { CSSProperties, Key, MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import { useDict } from '@/hooks/useDict';
import {
  type BatchOpResult,
  batchDeleteUsers,
  batchSetUserStatus,
  getUserDetail,
  pageUser,
  resetUserPassword,
  USER_STATUS,
  type UserVO,
} from '@/services/org/user';
import { useOrgId } from '@/utils/orgContext';
import BatchAssignModal from './BatchAssignModal';
import BatchResultModal from './BatchResultModal';
import CopyPermissionModal from './CopyPermissionModal';
import { USER_DICT } from './dictCodes';
import {
  fmtFull,
  renderSex,
  renderStatus,
  USER_PRESC_CLASS_OPTIONS,
  USER_STATUS_OPTIONS,
} from './shared';
import UserDeptAssignModal from './UserDeptAssignModal';
import UserFormModal from './UserFormModal';
import UserRoleAssignModal from './UserRoleAssignModal';
import './index.less';

/** 表头+分页+边距扣减常数(微调口诀:分页被裁 → 调大;下方见缝 → 调小) */
const TABLE_CHROME = 96;

/** Select 选项反查 label(处方类别列复用,本地常量不走字典) */
function findLabel(
  opts: { value: string | number; label: string }[],
  v: string | number | undefined | null,
): string {
  if (v == null) return '';
  return opts.find((o) => String(o.value) === String(v))?.label ?? String(v);
}

export default function UserManage() {
  const { message } = App.useApp();
  const { initialState } = useModel('@@initialState');
  const self = initialState?.currentUser;
  /** 防自锁:id 或账号命中当前登录人;self 取不到时守卫失效(不阻塞) */
  const isSelf = (r: UserVO) =>
    (self?.id != null && Number(r.id) === Number(self.id)) ||
    (!!self?.account && r.account === self.account);

  const [copySource, setCopySource] = useState<UserVO | null>(null);

  // ===== ★遗留#2 字典翻译(post/level 存字典 code;batchTranslate 一次拉全量本地匹配)=====
  const { batchTranslate } = useDict();
  const [postLabels, setPostLabels] = useState<Record<string, string>>({});
  const [levelLabels, setLevelLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    // 平台级字典(PT0.2.x)与机构无关,挂载一次;失败静默 → 列显示原始 code,不阻断
    batchTranslate(USER_DICT.post)
      .then(setPostLabels)
      .catch(() => {});
    batchTranslate(USER_DICT.level)
      .then(setLevelLabels)
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 机构数据域(响应式版) =====
  const orgId = useOrgId();
  const miId = orgId != null && Number(orgId) > 0 ? Number(orgId) : null;
  const miIdRef = useRef<number | null>(miId);
  miIdRef.current = miId;
  const actionRef = useRef<ActionType | undefined>(undefined);

  // ===== ★⑲ 表体定高测量契约 =====
  const [tableBodyHeight, setTableBodyHeight] = useState(360);
  const tableFillRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = tableFillRef.current;
    if (!el) return;
    const calc = () => {
      const byParent = el.clientHeight - TABLE_CHROME;
      const byViewport = window.innerHeight - 190;
      setTableBodyHeight(Math.max(200, Math.min(byParent, byViewport)));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    window.addEventListener('resize', calc);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calc);
    };
  }, []);
  const tableFillStyle = {
    flex: 1,
    minHeight: 0,
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    '--ubody-h': `${tableBodyHeight}px`,
  } as CSSProperties;

  // ===== 筛选态(state 控 UI,filterRef 供 request 读取) =====
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  const filterRef = useRef<{ keyword?: string; status?: string }>({});
  const doSearch = () => {
    filterRef.current = { keyword: keyword.trim() || undefined, status };
    actionRef.current?.reloadAndRest?.();
  };
  const doReset = () => {
    setKeyword('');
    setStatus(undefined);
    filterRef.current = {};
    actionRef.current?.reloadAndRest?.();
  };

  // ===== 行选择(★⑬ 任何 request 清空;★⑱ 单击行切换) =====
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<UserVO[]>([]);
  const clearSelection = () => {
    setSelectedKeys([]);
    setSelectedRows([]);
  };
  const rowSelection = {
    selectedRowKeys: selectedKeys,
    columnWidth: 32,
    onChange: (keys: readonly Key[], rows: readonly UserVO[]) => {
      setSelectedKeys(keys.map(String));
      setSelectedRows([...rows]);
    },
  };
  const toggleRow = (r: UserVO) => {
    const key = String(r.id);
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
    setSelectedRows((prev) =>
      prev.some((x) => String(x.id) === key)
        ? prev.filter((x) => String(x.id) !== key)
        : [...prev, r],
    );
  };
  const onRow = (r: UserVO) => ({
    onClick: (e: ReactMouseEvent<HTMLElement>) => {
      const el = e.target as HTMLElement;
      if (el.closest('.ant-table-selection-column')) return;
      toggleRow(r);
    },
    onDoubleClick: () => {
      openEdit(r);
    },
  });

  // ===== 机构切换响应(保险通道) =====
  const prevMiRef = useRef<number | null>(miId);
  useEffect(() => {
    if (prevMiRef.current === miId) return;
    prevMiRef.current = miId;
    if (miId == null) return;
    setKeyword('');
    setStatus(undefined);
    filterRef.current = {};
    clearSelection();
    actionRef.current?.reloadAndRest?.();
  }, [miId]);

  // ===== 弹窗状态 =====
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserVO | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUser, setAssignUser] = useState<UserVO | null>(null);
  const [deptOpen, setDeptOpen] = useState(false);
  const [deptUser, setDeptUser] = useState<UserVO | null>(null);
  const [batchAssignOpen, setBatchAssignOpen] = useState(false);
  const [batchKind, setBatchKind] = useState<'role' | 'dept'>('role');
  const [batchUsers, setBatchUsers] = useState<UserVO[]>([]);
  const [batchResult, setBatchResult] = useState<{
    title: string;
    res: BatchOpResult;
  } | null>(null);

  /** ★⑫ 防自锁:批量资格集剔除当前登录人 */
  const operableRows = useMemo(
    () => selectedRows.filter((r) => !isSelf(r)),
    [selectedRows],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const canLock =
    operableRows.length > 0 &&
    operableRows.every((r) => String(r.status) === USER_STATUS.NORMAL);
  const canUnlock =
    operableRows.length > 0 &&
    operableRows.every((r) => String(r.status) !== USER_STATUS.NORMAL);

  const openEdit = (r: UserVO) => {
    setEditing(r);
    setFormOpen(true);
    getUserDetail(r.id)
      .then(setEditing)
      .catch(() => {});
  };

  const resetPwd = (r: UserVO) => {
    Modal.confirm({
      title: `重置密码「${r.name}」?`,
      content:
        '重置后该账号密码将变为默认密码 123456,该用户下次登录将被引导修改密码,确定重置?',
      okText: '重置',
      onOk: async () => {
        try {
          const res = await resetUserPassword(r.id);
          message.success(res?.message || '重置完成,默认密码为 123456');
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message);
          throw e;
        }
      },
    });
  };

  // ===== 批量操作(部分成功模式) =====
  const batchToggleStatus = (lock: boolean) => {
    if (operableRows.length === 0) return;
    const ids = operableRows.map((r) => Number(r.id));
    Modal.confirm({
      title: lock ? `锁定 ${ids.length} 个账号?` : `解锁 ${ids.length} 个账号?`,
      content: lock
        ? '锁定后这些账号将无法登录(不含当前登录人)。'
        : '解锁后这些账号可正常登录。',
      okText: lock ? '锁定' : '解锁',
      okButtonProps: lock ? { danger: true } : undefined,
      onOk: async () => {
        try {
          const res = await batchSetUserStatus({
            userIds: ids,
            status: lock ? 2 : 1,
          });
          clearSelection();
          actionRef.current?.reload();
          setBatchResult({
            title: lock ? '批量锁定结果' : '批量解锁结果',
            res,
          });
        } catch (e) {
          message.error((e as Error).message);
          throw e;
        }
      },
    });
  };
  const batchRemove = () => {
    if (operableRows.length === 0) return;
    const ids = operableRows.map((r) => Number(r.id));
    Modal.confirm({
      title: `删除 ${ids.length} 个账号?`,
      content:
        '删除后这些账号将无法登录,账号名将被占用不可复用(含已删除账号);同时将同步解除其全部角色/部门/用户组绑定(不含当前登录人),确定删除?',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await batchDeleteUsers({ userIds: ids });
          clearSelection();
          actionRef.current?.reload();
          setBatchResult({ title: '批量删除结果', res });
        } catch (e) {
          message.error((e as Error).message);
          throw e;
        }
      },
    });
  };
  const openAssign = (kind: 'role' | 'dept') => {
    if (selectedRows.length === 1) {
      const row = selectedRows[0];
      if (!row) return;
      if (kind === 'role') {
        setAssignUser(row);
        setAssignOpen(true);
      } else {
        setDeptUser(row);
        setDeptOpen(true);
      }
      return;
    }
    setBatchKind(kind);
    setBatchUsers(selectedRows);
    setBatchAssignOpen(true);
  };

  // ===== 列定义(★⑯ 像素宽;post/level 已接字典翻译) =====
  const columns: ProColumns<UserVO>[] = [
    {
      title: '工号',
      dataIndex: 'account',
      width: 130,
      align: 'center',
      render: (_, r) => (
        <Space size={4}>
          <span>{r.account || '-'}</span>
          {isSelf(r) && <Tag color="blue">当前用户</Tag>}
        </Space>
      ),
    },
    {
      title: '姓名',
      dataIndex: 'name',
      width: 110,
      align: 'center',
      ellipsis: true,
      render: (_, r) => r.name || '-',
    },
    {
      title: '性别',
      dataIndex: 'sex',
      width: 70,
      align: 'center',
      render: (_, r) => renderSex(r.sex),
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      width: 140,
      align: 'center',
      render: (_, r) => r.phone || '-',
    },
    {
      title: '岗位',
      dataIndex: 'post',
      width: 110,
      align: 'center',
      ellipsis: true,
      // ★遗留#2 已落地:本地 Map 翻译;历史自由文本/未命中 code → 原样回显
      render: (_, r) => (r.post ? (postLabels[String(r.post)] ?? r.post) : '-'),
    },
    {
      title: '职务',
      dataIndex: 'position',
      width: 110,
      align: 'center',
      ellipsis: true,
      render: (_, r) => r.position || '-',
    },
    {
      title: '职称/级别',
      dataIndex: 'level',
      width: 110,
      align: 'center',
      ellipsis: true,
      render: (_, r) =>
        r.level ? (levelLabels[String(r.level)] ?? r.level) : '-',
    },
    {
      title: '处方类别',
      dataIndex: 'prescClass',
      width: 120,
      align: 'center',
      ellipsis: true,
      render: (_, r) =>
        findLabel(USER_PRESC_CLASS_OPTIONS, r.prescClass) || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      align: 'center',
      render: (_, r) => renderStatus(r.status),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 170,
      align: 'center',
      render: (_, r) => fmtFull(r.createTime),
    },
  ];

  return (
    <PageFill>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          height: '100%',
          overflow: 'hidden',
          background: '#fff',
          borderRadius: 8,
          padding: '12px 16px 8px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 筛选区 */}
        <div
          style={{ display: 'flex', gap: 8, marginBottom: 8, flexShrink: 0 }}
        >
          <Input
            allowClear
            style={{ width: 220 }}
            placeholder="姓名 / 账号 / 手机号 / 拼音码"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={doSearch}
          />
          <Select
            allowClear
            style={{ width: 110 }}
            placeholder="状态"
            options={USER_STATUS_OPTIONS}
            value={status}
            onChange={(v) => setStatus(v)}
          />
          <Button type="primary" onClick={doSearch}>
            查询
          </Button>
          <Button onClick={doReset}>重置</Button>
        </div>

        {/* 工具条 */}
        <div className="user-toolbar">
          <span className="user-toolbar__title">用户列表</span>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            title="新增用户"
            disabled={miId == null}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          />
          <span className="user-toolbar__divider" />
          <Button
            type="text"
            icon={<EditOutlined />}
            title="编辑（选中 1 项，或双击行）"
            disabled={selectedKeys.length !== 1}
            onClick={() => {
              const row = selectedRows[0];
              if (row) openEdit(row);
            }}
          />
          <Button
            type="text"
            icon={<ApartmentOutlined />}
            title="分配角色"
            disabled={selectedKeys.length === 0}
            onClick={() => openAssign('role')}
          />
          <Button
            type="text"
            icon={<ClusterOutlined />}
            title="分配部门"
            disabled={selectedKeys.length === 0}
            onClick={() => openAssign('dept')}
          />
          <Button
            type="text"
            icon={<CopyOutlined />}
            title="复制权限（选中 1 项）"
            disabled={selectedKeys.length !== 1}
            onClick={() => {
              const row = selectedRows[0];
              if (row) setCopySource(row);
            }}
          />
          <span className="user-toolbar__divider" />
          <Button
            type="text"
            icon={<KeyOutlined />}
            title="重置密码（选中 1 项）"
            disabled={selectedKeys.length !== 1}
            onClick={() => {
              const row = selectedRows[0];
              if (row) resetPwd(row);
            }}
          />
          <Button
            type="text"
            icon={<StopOutlined />}
            title="锁定选中账号"
            disabled={!canLock}
            onClick={() => batchToggleStatus(true)}
          />
          <Button
            type="text"
            icon={<CheckCircleOutlined />}
            title="解锁选中账号"
            disabled={!canUnlock}
            onClick={() => batchToggleStatus(false)}
          />
          <span className="user-toolbar__divider" />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            title="删除选中账号"
            disabled={operableRows.length === 0}
            onClick={batchRemove}
          />
          <Button
            type="text"
            icon={<ReloadOutlined />}
            title="刷新"
            onClick={() => actionRef.current?.reload()}
          />
          {selectedKeys.length > 0 && (
            <span className="user-toolbar__selchip">
              已选 {selectedKeys.length} 项<a onClick={clearSelection}>清空</a>
            </span>
          )}
        </div>

        {/* ★⑲ 表格填充区 */}
        <div
          ref={tableFillRef}
          className="user-table-fill"
          style={tableFillStyle}
        >
          <FillTable
            pro
            rowKey={(r: UserVO) => String(r.id)}
            actionRef={actionRef}
            columns={columns}
            rowSelection={rowSelection}
            onRow={onRow}
            tableAlertRender={false}
            tableAlertOptionRender={false}
            search={false}
            options={false}
            cardBordered={false}
            tableLayout="fixed"
            scroll={{ x: 1200, y: tableBodyHeight }}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无用户"
                >
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={miId == null}
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    新增用户
                  </Button>
                </Empty>
              ),
            }}
            request={async (params: {
              current?: number;
              pageSize?: number;
            }) => {
              // ★⑬ 任何重查清空选中,防跨页累积误操作
              clearSelection();
              const cur = miIdRef.current;
              if (cur == null) {
                return { data: [], total: 0, success: false };
              }
              try {
                const res = await pageUser({
                  page: params.current ?? 1,
                  size: params.pageSize ?? 20,
                  miId: cur,
                  ...filterRef.current,
                });
                return { data: res.records, total: res.total, success: true };
              } catch (e) {
                message.error((e as Error).message);
                return { data: [], total: 0, success: false };
              }
            }}
          />
        </div>
      </div>

      {/* 弹窗群 */}
      <BatchResultModal
        open={!!batchResult}
        title={batchResult?.title ?? ''}
        result={batchResult?.res ?? null}
        onClose={() => setBatchResult(null)}
      />
      <CopyPermissionModal
        open={!!copySource}
        source={copySource}
        onClose={() => setCopySource(null)}
        onDone={() => {
          setCopySource(null);
          actionRef.current?.reload();
        }}
      />
      <UserFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          actionRef.current?.reload();
        }}
      />
      <UserRoleAssignModal
        open={assignOpen}
        user={assignUser}
        onClose={() => setAssignOpen(false)}
        onSaved={() => setAssignOpen(false)}
      />
      <UserDeptAssignModal
        open={deptOpen}
        user={deptUser}
        onClose={() => setDeptOpen(false)}
        onSaved={() => setDeptOpen(false)}
      />
      <BatchAssignModal
        open={batchAssignOpen}
        kind={batchKind}
        users={batchUsers}
        onClose={() => setBatchAssignOpen(false)}
        onDone={() => {
          setBatchAssignOpen(false);
          clearSelection();
          actionRef.current?.reload();
        }}
      />
    </PageFill>
  );
}
// ★FillTable 透传检查(均在 src/components/FillTable/index.tsx):
// ① rowSelection;② tableAlertRender/tableAlertOptionRender;③ onRow;④ scroll 原样透传
