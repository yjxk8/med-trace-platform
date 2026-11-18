/**
 * 授权审计页（v1.2 解封⑥）—— 契约 §5.3 接口16-18 / §7.5
 * 三块：审计分页（组合筛选）+ 批次明细 Drawer + 麻精权限链路 Modal（三参数全必填，≤500）
 * 快照 before/afterSnapshot 以 Modal 内 pre 渲染（JSON 字符串，格式化失败显原文）
 * 反馈⑨/⑲：目标用户列直读后端读时填充的 targetName（含存量行；软删用户姓名照常返回，
 *           null 显 '-'；TargetUserCell 反查组件已删除）——若响应无该字段属后端侧
 *           未部署/命名漂移，见 targetNameOf 单点取值
 * 反馈⑨续：筛选条「操作人id」InputNumber → UserRemoteSelect（服务端模糊检索，
 *           operatorId 语义不变）；链路 Modal 用户选择同款
 */

import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
  App,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Table,
  Tooltip,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import {
  AUDIT_ACTIONS,
  type AuditVO,
  fetchAuditBatch,
  fetchAuditPage,
  fetchNarcoticChain,
  type NarcoticChainVO,
} from '@/services/org/userGroup';
import {
  AUDIT_BIZ_TYPE_OPTIONS,
  AUDIT_SOURCE_OPTIONS,
  fmtFull,
  renderNarcoticFlag,
} from './shared';
import UserRemoteSelect from './UserRemoteSelect';
import './index.less';

const FMT = 'YYYY-MM-DD HH:mm:ss';
const fmtT = (d: Dayjs | null) => (d ? d.format(FMT) : undefined);

/**
 * 反馈⑲ 单点取值：直读读时填充的 targetName（契约 §三）。
 * 若联调发现响应键名不同（如 targetUserName），只改本函数一行即可，列定义不动。
 */
const targetNameOf = (r: AuditVO): string | null => r.targetName ?? null;

function showSnapshot(title: string, raw: string | null) {
  let pretty = raw ?? '-';
  if (raw) {
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      /* 显原文 */
    }
  }
  Modal.info({
    title,
    width: 640,
    content: (
      <pre style={{ maxHeight: 420, overflow: 'auto', fontSize: 12 }}>
        {pretty}
      </pre>
    ),
  });
}

export default function AuditAuth() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [batchId, setBatchId] = useState('');
  const [bizType, setBizType] = useState<string | undefined>();
  const [action, setAction] = useState<string | undefined>();
  const [operatorId, setOperatorId] = useState<number | undefined>();
  const [narcoticFlag, setNarcoticFlag] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const filterRef = useRef<Record<string, unknown>>({});
  const [batchDrawerId, setBatchDrawerId] = useState<string | null>(null);
  const [batchRows, setBatchRows] = useState<AuditVO[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [chainOpen, setChainOpen] = useState(false);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainRows, setChainRows] = useState<NarcoticChainVO[]>([]);

  const doSearch = () => {
    filterRef.current = {
      batchId: batchId.trim() || undefined,
      bizType: bizType != null ? Number(bizType) : undefined,
      action,
      operatorId,
      narcoticFlag: narcoticFlag != null ? Number(narcoticFlag) : undefined,
      startTime: range?.[0] ? fmtT(range[0]) : undefined,
      endTime: range?.[1] ? fmtT(range[1]) : undefined,
    };
    actionRef.current?.reloadAndRest?.();
  };

  const doReset = () => {
    setBatchId('');
    setBizType(undefined);
    setAction(undefined);
    setOperatorId(undefined);
    setNarcoticFlag(undefined);
    setRange(null);
    filterRef.current = {};
    actionRef.current?.reloadAndRest?.();
  };

  const openBatch = (id: string) => {
    setBatchDrawerId(id);
    setBatchLoading(true);
    fetchAuditBatch(id)
      .then((list) => setBatchRows(list ?? []))
      .catch((e) => message.error((e as Error).message))
      .finally(() => setBatchLoading(false));
  };

  const doChain = (v: {
    userId: number;
    range: [Dayjs | null, Dayjs | null] | null;
  }) => {
    if (!v.range?.[0] || !v.range?.[1]) {
      message.warning('请选择完整的时间范围');
      return;
    }
    setChainLoading(true);
    // ⚠️ 参数名按 userId/startTime/endTime 假定【反馈⑫】，联调按后端实际调整
    fetchNarcoticChain({
      userId: v.userId,
      startTime: fmtT(v.range[0]) as string,
      endTime: fmtT(v.range[1]) as string,
    })
      .then((list) => {
        setChainRows(list ?? []);
        if (!list?.length) message.info('该时间范围内无麻精权限链路记录');
      })
      .catch((e) => message.error((e as Error).message))
      .finally(() => setChainLoading(false));
  };

  const columns: ProColumns<AuditVO>[] = [
    {
      title: '批次',
      dataIndex: 'batchId',
      width: '12%',
      ellipsis: true,
      render: (_, r) =>
        r.batchId ? (
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => openBatch(String(r.batchId))}
          >
            {String(r.batchId)}
          </Button>
        ) : (
          '-'
        ),
    },
    {
      title: '业务类型',
      dataIndex: 'bizType',
      width: '8%',
      align: 'center',
      render: (_, r) =>
        AUDIT_BIZ_TYPE_OPTIONS.find(
          (o) => String(o.value) === String(r.bizType),
        )?.label ??
        r.bizType ??
        '-',
    },
    {
      title: '业务id',
      dataIndex: 'bizId',
      width: '6%',
      align: 'center',
      render: (_, r) => r.bizId ?? '-',
    },
    {
      // 反馈⑲：直读 targetName；全 '-' 时按文件头注释三步定位（部署/键名/填充）
      title: '目标用户',
      dataIndex: 'targetName',
      width: '9%',
      align: 'center',
      render: (_, r) => targetNameOf(r) || '-',
    },
    {
      title: '动作',
      dataIndex: 'action',
      width: '7%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => r.action || '-',
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      width: '9%',
      align: 'center',
      render: (_, r) => r.operatorName || '-',
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: '7%',
      align: 'center',
      render: (_, r) =>
        AUDIT_SOURCE_OPTIONS.find((o) => String(o.value) === String(r.source))
          ?.label ??
        r.source ??
        '-',
    },
    {
      title: '麻精',
      dataIndex: 'narcoticFlag',
      width: '6%',
      align: 'center',
      render: (_, r) => renderNarcoticFlag(r.narcoticFlag),
    },
    {
      title: '链路描述',
      dataIndex: 'remark',
      width: '16%',
      ellipsis: { showTitle: false },
      render: (_, r) => (
        <Tooltip title={r.remark || '-'}>
          <span>{r.remark || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: '时间',
      dataIndex: 'createTime',
      width: '12%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => fmtFull(r.createTime),
    },
    {
      title: '快照',
      valueType: 'option',
      width: '8%',
      align: 'center',
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          onClick={() =>
            showSnapshot(
              `快照 #${r.id}`,
              [r.beforeSnapshot, r.afterSnapshot]
                .filter(Boolean)
                .join('\n----\n'),
            )
          }
        >
          查看
        </Button>
      ),
    },
  ];

  const batchColumns = [
    { title: 'id', dataIndex: 'id', width: 50 },
    { title: '动作', dataIndex: 'action', width: 90 },
    {
      title: '业务类型',
      dataIndex: 'bizType',
      width: 90,
      render: (v: number | string | null) =>
        AUDIT_BIZ_TYPE_OPTIONS.find((o) => String(o.value) === String(v))
          ?.label ??
        v ??
        '-',
    },
    {
      // 反馈⑲：直读 targetName（若键名漂移，与主表 targetNameOf 一并调整）
      title: '目标用户',
      dataIndex: 'targetName',
      width: 100,
      render: (v: string | null) => v || '-',
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      width: 90,
      render: (v: string | null) => v || '-',
    },
    {
      title: '链路描述',
      dataIndex: 'remark',
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: '时间',
      dataIndex: 'createTime',
      ellipsis: true,
      width: 150,
      render: (v: string | null) => fmtFull(v),
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
          padding: '12px 16px 8px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 8,
            flexWrap: 'wrap',
            flexShrink: 0,
          }}
        >
          <Input
            allowClear
            style={{ width: 180 }}
            placeholder="批次号"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            onPressEnter={doSearch}
          />
          <Select
            allowClear
            style={{ width: 120 }}
            placeholder="业务类型"
            options={AUDIT_BIZ_TYPE_OPTIONS}
            value={bizType}
            onChange={(v) => setBizType(v)}
          />
          <Select
            allowClear
            style={{ width: 120 }}
            placeholder="动作"
            options={AUDIT_ACTIONS.map((a) => ({ value: a, label: a }))}
            value={action}
            onChange={(v) => setAction(v)}
          />
          {/* 反馈⑨续：操作人筛选由手填 id → 服务端模糊检索（姓名/账号/拼音码），值仍为 operatorId */}
          <UserRemoteSelect
            style={{ width: 160 }}
            value={operatorId}
            onChange={(v) => setOperatorId(v ?? undefined)}
            placeholder="操作人（姓名/账号）"
          />
          <Select
            allowClear
            style={{ width: 100 }}
            placeholder="麻精"
            options={[
              { value: '1', label: '涉麻精' },
              { value: '2', label: '否' },
            ]}
            value={narcoticFlag}
            onChange={(v) => setNarcoticFlag(v)}
          />
          <DatePicker.RangePicker
            showTime
            value={range}
            onChange={(v) => setRange(v as [Dayjs | null, Dayjs | null] | null)}
          />
          <Button type="primary" onClick={doSearch}>
            查询
          </Button>
          <Button onClick={doReset}>重置</Button>
          <Button
            type="primary"
            danger
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              setChainRows([]);
              setChainOpen(true);
            }}
          >
            麻精权限链路
          </Button>
        </div>
        <div className="group-table-fill">
          <FillTable
            pro
            headerTitle="授权审计日志"
            rowKey={(r: AuditVO) => String(r.id)}
            actionRef={actionRef}
            columns={columns}
            search={false}
            options={{ reload: true, density: false, setting: false }}
            tableLayout="fixed"
            pagination={{
              pageSize: 10,
              defaultPageSize: 10,
              showSizeChanger: false,
            }}
            request={async (params: {
              current?: number;
              pageSize?: number;
            }) => {
              try {
                const res = await fetchAuditPage({
                  page: params.current ?? 1,
                  size: params.pageSize ?? 10,
                  ...(filterRef.current as Parameters<
                    typeof fetchAuditPage
                  >[0]),
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

      {/* 批次明细 */}
      <Drawer
        title={`批次明细：${batchDrawerId ?? ''}`}
        open={!!batchDrawerId}
        onClose={() => setBatchDrawerId(null)}
        size={860} // antd6:width → size(数字合法)
        destroyOnHidden
      >
        <Table
          rowKey={(r: AuditVO) => String(r.id)}
          size="small"
          loading={batchLoading}
          columns={batchColumns as never}
          dataSource={batchRows}
          pagination={false}
          scroll={{ y: 560 }}
        />
      </Drawer>

      {/* 麻精链路 */}
      <Modal
        title="用户麻精权限链路（监管导出）"
        open={chainOpen}
        onCancel={() => setChainOpen(false)}
        footer={null}
        width={820}
        destroyOnHidden
      >
        <Form layout="inline" onFinish={doChain} style={{ marginBottom: 12 }}>
          <Form.Item
            name="userId"
            rules={[{ required: true, message: '请选择用户' }]}
          >
            {/* 反馈⑨：服务端模糊检索（姓名/账号/手机号/拼音码），值为 userId */}
            <UserRemoteSelect
              style={{ width: 240 }}
              placeholder="输入姓名 / 账号 / 拼音码检索"
            />
          </Form.Item>
          <Form.Item
            name="range"
            rules={[{ required: true, message: '时间范围必填' }]}
          >
            <DatePicker.RangePicker showTime />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={chainLoading}>
              查询
            </Button>
          </Form.Item>
        </Form>
        <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>
          三参数全必填；单次上限 500 条。
        </div>
        <Table
          rowKey={(r: NarcoticChainVO, i?: number) =>
            String(r.confirmId ?? '') + String(i)
          }
          size="small"
          loading={chainLoading}
          columns={
            [
              {
                title: '时间',
                dataIndex: 'time',
                width: 160,
                render: (v: string | null) => fmtFull(v),
              },
              {
                title: '动作',
                dataIndex: 'action',
                width: 90,
                render: (v: string | null) => v || '-',
              },
              {
                title: '链路',
                dataIndex: 'path',
                render: (v: string | null) => v || '-',
              },
              {
                title: '操作人',
                dataIndex: 'operator',
                width: 100,
                render: (v: string | null) => v || '-',
              },
              {
                title: '确认单',
                dataIndex: 'confirmId',
                width: 90,
                render: (v: number | null) => (v != null ? `#${v}` : '-'),
              },
            ] as never
          }
          dataSource={chainRows}
          pagination={false}
          scroll={{ y: 380 }}
        />
      </Modal>
    </PageFill>
  );
}
