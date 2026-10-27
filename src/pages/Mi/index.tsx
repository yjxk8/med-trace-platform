/**
 * 医疗机构（列表页，扁平树序缩进）—— 契约：医疗机构 v1 §三/§6.4/§6.5
 * PageFill 骨架 + FillTable(ProTable request 模式)；IPage 分页；固定排序 parentId→id（前端不再排）
 * - 树形用缩进呈现（§6.5），不建 children：深度由 buildMiIndex 沿父链上溯，
 *   数据源=跨页累积的已加载记录（分页下尽力而为，父级页未浏览时可能浅一级，翻到即正确）
 * - 删除（§6.4 永久作废语义）：确认文案写明 code/social_code 永久无法再次使用；
 *   有「已加载」下级禁用删除按钮，跨页下级由后端 500 文案兜底
 * - 关闭/启用（§一.6）：关闭=业务停用可恢复，文案与删除的「永久」明确区分
 * ⚠️ FillTable 非泛型：回调参数显式注解（TS7006）
 */
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { App, Button, Input, Modal, Select, Space, Tooltip } from 'antd';
import { useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import {
  buildMiIndex,
  deleteMi,
  getMiPage,
  MI_STATUS,
  type MiVO,
  setMiStatus,
} from '@/services/org/mi';
import { fmtDateTime } from '@/utils/format'; // R5：日期唯一来源
import MiFormModal from './MiFormModal';
import {
  MI_STATUS_OPTIONS,
  MI_TENANT_TYPE_OPTIONS,
  renderRegion,
  renderStatus,
  renderTenantType,
} from './shared';

export default function MiManage() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [tenantType, setTenantType] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const filterRef = useRef<{
    name?: string;
    code?: string;
    tenantType?: string;
    status?: string;
  }>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MiVO | null>(null);

  /** 跨页累积已加载记录（深度/下级判断的尽力而为数据源；id→parentId 稳定，合并去重即可） */
  const loadedRef = useRef<MiVO[]>([]);
  const miIndexRef = useRef(buildMiIndex(loadedRef.current));
  const mergeLoaded = (records: MiVO[]) => {
    const seen = new Set(loadedRef.current.map((r) => r.id));
    loadedRef.current = [
      ...loadedRef.current,
      ...records.filter((r) => !seen.has(r.id)),
    ];
    miIndexRef.current = buildMiIndex(loadedRef.current);
  };

  const doSearch = () => {
    filterRef.current = {
      name: name.trim() || undefined,
      code: code.trim() || undefined,
      tenantType,
      status,
    };
    actionRef.current?.reloadAndRest?.();
  };
  const doReset = () => {
    setName('');
    setCode('');
    setTenantType(undefined);
    setStatus(undefined);
    filterRef.current = {};
    actionRef.current?.reloadAndRest?.();
  };

  /** §6.4：永久作废语义（与 mi-config 复活语义相反）——文案写明 code/social_code 永久占用 */
  const removeMi = (r: MiVO) => {
    Modal.confirm({
      title: `删除机构「${r.name}」？`,
      content: `删除后机构代码 ${r.code}${r.socialCode ? `、统一社会信用代码 ${r.socialCode}` : ''} 将永久无法再次使用（重新创建同名机构也无法复用）。`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await deleteMi(r.id);
          message.success(res?.message || '删除成功');
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message); // 如「存在下级机构，请先删除下级机构」（跨页下级兜底）
          throw e; // 保持弹窗打开
        }
      },
    });
  };

  /** §一.6：关闭=业务停用可恢复（≠删除） */
  const toggleStatus = (r: MiVO) => {
    const close = String(r.status) === MI_STATUS.NORMAL; // 当前正常 → 关闭
    Modal.confirm({
      title: close ? `关闭机构「${r.name}」？` : `启用机构「${r.name}」？`,
      content: close
        ? '关闭后该机构业务停用（列表仍可见），可随时重新启用。'
        : '启用后该机构恢复业务。',
      okText: close ? '关闭' : '启用',
      okButtonProps: close ? { danger: true } : undefined,
      onOk: async () => {
        try {
          const res = await setMiStatus(r.id, close ? 2 : 1);
          message.success(res?.message || (close ? '已关闭' : '已启用'));
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message);
          throw e;
        }
      },
    });
  };

  const columns: ProColumns<MiVO>[] = [
    {
      title: '机构名称',
      dataIndex: 'name',
      width: 260,
      render: (_, r) => {
        const depth = miIndexRef.current.depthOf(r.id); // §6.5 缩进呈现树形
        const isTop = Number(r.parentId) === 0;
        return (
          <span
            style={{
              paddingLeft: depth * 16,
              display: 'inline-block',
              fontWeight: isTop ? 600 : 400,
            }}
          >
            {r.name || '-'}
          </span>
        );
      },
    },
    {
      title: '机构代码',
      dataIndex: 'code',
      width: 110,
      render: (_, r) => r.code || '-',
    },
    {
      title: '类型',
      dataIndex: 'tenantType',
      width: 110,
      align: 'center',
      render: (_, r) => renderTenantType(r.tenantType),
    },
    {
      title: '等级',
      dataIndex: 'orgGrade',
      width: 80,
      align: 'center',
      render: (_, r) => r.orgGrade || '-',
    },
    {
      title: '所在地',
      dataIndex: 'city',
      width: 180,
      ellipsis: true,
      render: (_, r) => renderRegion(r),
    },
    {
      title: '联系电话',
      dataIndex: 'phone',
      width: 130,
      render: (_, r) => r.phone || r.telephone || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      align: 'center',
      render: (_, r) => renderStatus(r.status),
    },
    {
      title: '更新时间',
      dataIndex: 'updateTime',
      width: 165,
      align: 'center',
      render: (_, r) => fmtDateTime(r.updateTime),
    },
    {
      title: '操作',
      valueType: 'option',
      fixed: 'right',
      width: 130,
      align: 'center',
      // ⚠️ 第一参是 dom，必须占位 _（历史坑）
      render: (_, r) => {
        const hasChildren = miIndexRef.current.hasChildren(r.id); // 已加载数据判断；跨页由后端兜底
        return (
          <Space size={0}>
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={
                  <EditOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
                }
                onClick={() => {
                  setEditing(r);
                  setFormOpen(true);
                }}
              />
            </Tooltip>
            <Tooltip
              title={String(r.status) === MI_STATUS.NORMAL ? '关闭' : '启用'}
            >
              <Button
                type="text"
                size="small"
                style={{ padding: '0 4px' }}
                icon={
                  String(r.status) === MI_STATUS.NORMAL ? (
                    <CloseCircleOutlined
                      style={{ color: '#8c8c8c', fontSize: 14 }}
                    />
                  ) : (
                    <CheckCircleOutlined
                      style={{ color: '#52c41a', fontSize: 14 }}
                    />
                  )
                }
                onClick={() => toggleStatus(r)}
              />
            </Tooltip>
            <Tooltip
              title={hasChildren ? '存在下级机构，请先删除下级机构' : '删除'}
            >
              <Button
                type="text"
                size="small"
                danger
                style={{ padding: '0 4px' }}
                disabled={hasChildren} // §6.4：前端前置禁用（已加载范围），后端 500 兜底
                icon={<DeleteOutlined style={{ fontSize: 14 }} />}
                onClick={() => removeMi(r)}
              />
            </Tooltip>
          </Space>
        );
      },
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
        {/* 筛选区：name/code 模糊、tenantType/status 枚举（city/county 精确筛选契约支持，UI 暂不暴露） */}
        <div
          style={{ display: 'flex', gap: 8, marginBottom: 12, flexShrink: 0 }}
        >
          <Input
            allowClear
            style={{ width: 200 }}
            placeholder="机构名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={doSearch}
          />
          <Input
            allowClear
            style={{ width: 150 }}
            placeholder="机构代码"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onPressEnter={doSearch}
          />
          <Select
            allowClear
            style={{ width: 130 }}
            placeholder="租户类型"
            options={MI_TENANT_TYPE_OPTIONS}
            value={tenantType}
            onChange={(v) => {
              setTenantType(v);
              filterRef.current = { ...filterRef.current, tenantType: v };
              actionRef.current?.reloadAndRest?.();
            }}
          />
          <Select
            allowClear
            style={{ width: 100 }}
            placeholder="状态"
            options={MI_STATUS_OPTIONS}
            value={status}
            onChange={(v) => {
              setStatus(v);
              filterRef.current = { ...filterRef.current, status: v };
              actionRef.current?.reloadAndRest?.();
            }}
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
            新增机构
          </Button>
        </div>

        <FillTable
          pro
          reservedHeight={160}
          headerTitle="医疗机构"
          rowKey={(r: MiVO) => String(r.id)}
          actionRef={actionRef}
          columns={columns}
          search={false}
          options={{ reload: true, density: false, setting: false }}
          cardBordered={false}
          scroll={{ x: 1200 }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t: number) => `共 ${t} 条`,
          }}
          request={async (params: { current?: number; pageSize?: number }) => {
            try {
              const res = await getMiPage({
                page: params.current ?? 1,
                size: params.pageSize ?? 10,
                ...filterRef.current,
              });
              mergeLoaded(res.records); // 累积进索引（深度/下级判断）
              return { data: res.records, total: res.total, success: true };
            } catch (e) {
              message.error((e as Error).message); // 500 原文 toast；401 由拦截器跳登录
              return { data: [], total: 0, success: false };
            }
          }}
        />
      </div>

      <MiFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          actionRef.current?.reload();
        }}
      />
    </PageFill>
  );
}
