/**
 * 用户管理（列表页）—— 范式对齐「药品库存 / 字典管理」：
 * PageFill 骨架 + 白卡 + FillTable(ProTable request 模式) + App.useApp message
 * 契约：v3 终版（新 key：account/name/sex/phone/post/position/level/status/miId）
 *
 * 红线（交接文档沿用）：
 * - 防自锁：后端无守卫（§八-3）→ 自己的行隐藏「锁定/解锁」「删除」，账号旁标「当前用户」
 * - 锁定 ≠ 踢下线 / 软删 ≠ 立即掉线：确认文案不写「立即下线/掉线」
 * - 机构列暂显 miId【遗留#1】；机构筛选待 org 模块
 * - 列表默认不带 miId（数据范围未定 §八-5，全平台视图）
 *
 * ⚠️ FillTable 非泛型：回调参数显式注解（TS7006）
 */
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { App, Button, Input, Modal, Select, Space, Tag, Tooltip } from 'antd';
import { useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import {
  deleteUser,
  getUserDetail,
  pageUser,
  setUserStatus,
  USER_STATUS,
  type UserVO,
} from '@/services/org/user';
import ResetPwdModal from './ResetPwdModal';
import {
  fmtFull,
  renderSex,
  renderStatus,
  USER_STATUS_OPTIONS,
  USER_TENANT_TYPE_OPTIONS,
  USER_TYPE_OPTIONS,
} from './shared';
import UserFormModal from './UserFormModal';

export default function UserManage() {
  const { message } = App.useApp();
  /** 当前登录用户（防自锁）：登录页 setInitialState({ token, currentUser }) 写入，
   *  与登录态同源；v3 起字段为 id/account（原 uId/uAccount 作废） */
  const { initialState } = useModel('@@initialState');
  const self = initialState?.currentUser;

  const actionRef = useRef<ActionType | undefined>(undefined);

  // ===== 筛选（受控态 + 快照 ref，查询时生效——对齐 filterRef 范式）=====
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [tenantType, setTenantType] = useState<string | undefined>(undefined);
  const filterRef = useRef<{
    keyword?: string;
    type?: string;
    status?: string;
    tenantType?: string;
  }>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserVO | null>(null);
  const [resetTarget, setResetTarget] = useState<UserVO | null>(null);

  /** 防自锁：id 或账号命中当前登录用户；self 取不到时守卫自动失效（不阻塞） */
  const isSelf = (r: UserVO) =>
    (self?.id != null && Number(r.id) === Number(self.id)) ||
    (!!self?.account && r.account === self.account);

  const doSearch = () => {
    filterRef.current = {
      keyword: keyword.trim() || undefined,
      type,
      status,
      tenantType,
    };
    actionRef.current?.reloadAndRest?.();
  };
  const doReset = () => {
    setKeyword('');
    setType(undefined);
    setStatus(undefined);
    setTenantType(undefined);
    filterRef.current = {};
    actionRef.current?.reloadAndRest?.();
  };

  /** 编辑：行数据先上屏，详情覆盖回显（防旧行缺字段 → 空表单/undefined） */
  const openEdit = (r: UserVO) => {
    setEditing(r);
    setFormOpen(true);
    getUserDetail(r.id)
      .then(setEditing)
      .catch(() => {});
  };

  // ===== 行操作 =====
  const removeUser = (r: UserVO) => {
    Modal.confirm({
      title: `删除账号「${r.name}」？`,
      content:
        '删除后该账号将无法登录，账号名将被占用不可复用（含已删除账号）。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await deleteUser(r.id);
        message.success(res?.message || '删除成功');
        actionRef.current?.reload();
      },
    });
  };

  const toggleStatus = (r: UserVO) => {
    const lock = String(r.status) === USER_STATUS.NORMAL;
    Modal.confirm({
      title: lock ? `锁定账号「${r.name}」？` : `解锁账号「${r.name}」？`,
      content: lock ? '锁定后该账号将无法登录。' : '解锁后该账号可正常登录。',
      okText: lock ? '锁定' : '解锁',
      okButtonProps: lock ? { danger: true } : undefined,
      onOk: async () => {
        const res = await setUserStatus(r.id, lock ? 2 : 1);
        message.success(res?.message || (lock ? '已锁定' : '已解锁'));
        actionRef.current?.reload();
      },
    });
  };

  // ===== 列定义（数组显式泛型）=====
  const columns: ProColumns<UserVO>[] = [
    {
      title: '工号',
      dataIndex: 'account',
      width: 150,
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
      width: 130,
      align: 'center',
      render: (_, r) => r.phone || '-',
    },
    {
      title: '岗位',
      dataIndex: 'post',
      width: 110,
      align: 'center',
      ellipsis: true,
      render: (_, r) => r.post || '-',
    }, // 字典 code，【遗留#2】接入后换渲染
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
      render: (_, r) => r.level || '-',
    }, // 字典 code，【遗留#2】
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      align: 'center',
      render: (_, r) => renderStatus(r.status),
    },
    {
      title: '所属机构',
      dataIndex: 'miId',
      width: 90,
      align: 'center',
      render: (_, r) => r.miId ?? '-',
    }, // 【遗留#1】org 就绪后换名称
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 170,
      align: 'center',
      render: (_, r) => fmtFull(r.createTime),
    },
    {
      title: '操作',
      valueType: 'option',
      fixed: 'right',
      width: 150,
      align: 'center',
      // ⚠️ 第一参是 dom 节点，必须占位 _；写成 (r) 会把 dom 当行数据 → 编辑弹窗全空
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              style={{ padding: '0 4px' }}
              icon={<EditOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />}
              onClick={() => openEdit(r)}
            />
          </Tooltip>
          {!isSelf(r) && (
            <Tooltip
              title={String(r.status) === USER_STATUS.NORMAL ? '锁定' : '解锁'}
            >
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={
                  String(r.status) === USER_STATUS.NORMAL ? (
                    <StopOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
                  ) : (
                    <CheckCircleOutlined
                      style={{ color: '#52c41a', fontSize: 14 }}
                    />
                  )
                }
                onClick={() => toggleStatus(r)}
              />
            </Tooltip>
          )}
          <Tooltip title="重置密码">
            <Button
              type="text"
              size="small"
              style={{ padding: '0 4px' }}
              icon={<KeyOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />}
              onClick={() => setResetTarget(r)}
            />
          </Tooltip>
          {!isSelf(r) && (
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                style={{ padding: '0 4px' }}
                icon={<DeleteOutlined style={{ fontSize: 14 }} />}
                onClick={() => removeUser(r)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageFill>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          background: '#fff',
          borderRadius: 8,
          padding: '12px 16px 4px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 筛选区：keyword / 类型 / 状态 / 租户类型；机构下拉待 org 模块【遗留#1】 */}
        <div
          style={{ display: 'flex', gap: 8, marginBottom: 12, flexShrink: 0 }}
        >
          <Input
            allowClear
            style={{ width: 240 }}
            placeholder="姓名 / 账号 / 手机号 / 拼音码"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={doSearch}
          />
          <Select
            allowClear
            style={{ width: 130 }}
            placeholder="类型"
            options={USER_TYPE_OPTIONS}
            value={type}
            onChange={(v) => setType(v)}
          />
          <Select
            allowClear
            style={{ width: 110 }}
            placeholder="状态"
            options={USER_STATUS_OPTIONS}
            value={status}
            onChange={(v) => setStatus(v)}
          />
          <Select
            allowClear
            style={{ width: 110 }}
            placeholder="租户类型"
            options={USER_TENANT_TYPE_OPTIONS}
            value={tenantType}
            onChange={(v) => setTenantType(v)}
          />
          <Button type="primary" onClick={doSearch}>
            查询
          </Button>
          <Button onClick={doReset}>重置</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            新增用户
          </Button>
        </div>

        <FillTable
          pro
          reservedHeight={160} // 底部被裁/留白过大时微调此值
          headerTitle="用户列表"
          rowKey={(r: UserVO) => String(r.id)}
          actionRef={actionRef}
          columns={columns}
          search={false}
          options={{ reload: true, density: false, setting: false }}
          cardBordered={false}
          request={async (params: { current?: number; pageSize?: number }) => {
            try {
              const res = await pageUser({
                page: params.current ?? 1,
                size: params.pageSize ?? 10,
                ...filterRef.current,
              });
              return { data: res.records, total: res.total, success: true };
            } catch (e) {
              message.error((e as Error).message); // 500 原文 toast；401 由拦截器跳登录
              return { data: [], total: 0, success: false };
            }
          }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t: number) => `共 ${t} 条`,
          }}
        />
      </div>

      <UserFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          actionRef.current?.reload();
        }}
      />
      <ResetPwdModal
        open={!!resetTarget}
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onSaved={() => {
          setResetTarget(null);
          actionRef.current?.reload();
        }}
      />
    </PageFill>
  );
}
