/**
 * 合规确认待办页（v1.2 解封⑤）—— 契约 §5.2 接口12-15 / §7.3
 * 列表默认 status 不传 = 待办口径（后端默认查 1 待确认）
 * 详情 Drawer：payload parse+try-catch 后按 bizType 渲染影响清单
 * 审批：approve 对申请人本人禁用（4303 前端预判）；approve 返回「已驳回+rejectReason」
 *   按警告渲染（非异常，§7.3）；4301/4302 → 后端 toast + 刷新
 */
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import {
  App,
  Button,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import {
  approveConfirm,
  type ConfirmPayload,
  type ConfirmVO,
  fetchConfirmDetail,
  fetchConfirmPage,
  rejectConfirm,
} from '@/services/org/userGroup';
import {
  fmtFull,
  renderConfirmBizType,
  renderConfirmStatus,
  renderDataScopeText,
} from './shared';
import './index.less';

/** 当前登录用户 id（4303 预判用）——若工程登录态另有封装，替换此行获取方式即可 */
function useCurrentUserId(): number | undefined {
  const { initialState } = useModel('@@initialState');
  const cu = initialState as { currentUser?: { id?: number } } | undefined;
  return cu?.currentUser?.id;
}

function parsePayload(vo: ConfirmVO): ConfirmPayload | null {
  try {
    return vo.payload ? (JSON.parse(vo.payload) as ConfirmPayload) : null;
  } catch {
    return null;
  }
}

export default function ComplianceConfirm() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const filterRef = useRef<{ status?: number }>({});
  const [detail, setDetail] = useState<ConfirmVO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const currentUserId = useCurrentUserId();

  const doSearch = () => {
    filterRef.current = {
      status: status != null ? Number(status) : undefined, // 不传=待办口径
    };
    actionRef.current?.reloadAndRest?.();
  };

  const openDetail = (r: ConfirmVO) => {
    setDetailLoading(true);
    setDetail(r); // 先渲染行数据，再以详情覆盖（payload 以详情为准）
    fetchConfirmDetail(r.id)
      .then(setDetail)
      .catch((e) => message.error((e as Error).message))
      .finally(() => setDetailLoading(false));
  };

  const afterAct = () => {
    setDetail(null);
    actionRef.current?.reload();
  };

  const doApprove = (vo: ConfirmVO) => {
    Modal.confirm({
      title: `通过确认单 ${vo.confirmNo} 并执行？`,
      content: '通过后将立即执行变更（执行前全量重校验，失败自动驳回）。',
      okText: '通过并执行',
      onOk: async () => {
        try {
          const res = await approveConfirm(vo.id);
          if (res?.rejectReason) {
            Modal.warning({
              title: '执行被自动驳回',
              content: res.rejectReason,
            });
          } else {
            message.success(res?.message || '已通过并执行');
          }
          afterAct();
        } catch (e) {
          message.error((e as Error).message); // 4301/4302 原文
          actionRef.current?.reload();
          throw e;
        }
      },
    });
  };

  const doReject = (vo: ConfirmVO) => {
    let reason = '';
    Modal.confirm({
      title: `驳回确认单 ${vo.confirmNo}`,
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>驳回原因（必填）：</div>
          <Input.TextArea
            rows={3}
            maxLength={255}
            onChange={(e) => {
              reason = e.target.value;
            }}
          />
        </div>
      ),
      okText: '驳回',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!reason.trim()) {
          message.warning('请填写驳回原因');
          throw new Error('reason required'); // 保持确认框开启
        }
        try {
          await rejectConfirm(vo.id, reason.trim());
          message.success('已驳回');
          afterAct();
        } catch (e) {
          message.error((e as Error).message);
          throw e;
        }
      },
    });
  };

  const columns: ProColumns<ConfirmVO>[] = [
    { title: '确认单号', dataIndex: 'confirmNo', width: '12%', ellipsis: true },
    {
      title: '业务类型',
      dataIndex: 'bizType',
      width: '8%',
      align: 'center',
      render: (_, r) => renderConfirmBizType(r.bizType),
    },
    {
      title: '内容摘要',
      dataIndex: 'bizSummary',
      width: '16%',
      ellipsis: true,
      render: (_, r) => r.bizSummary || '-',
    },
    {
      title: '申请人',
      dataIndex: 'applicantName',
      width: '8%',
      align: 'center',
      render: (_, r) => r.applicantName || '-',
    },
    {
      title: '复核人',
      dataIndex: 'reviewerName',
      width: '8%',
      align: 'center',
      render: (_, r) => r.reviewerName || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: '6%',
      align: 'center',
      render: (_, r) => renderConfirmStatus(r.status),
    },
    {
      title: '超时时间',
      dataIndex: 'expireTime',
      width: '12%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => fmtFull(r.expireTime),
    },
    {
      title: '确认时间',
      dataIndex: 'confirmTime',
      width: '12%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => fmtFull(r.confirmTime),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: '12%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => fmtFull(r.createTime),
    },
    {
      title: '操作',
      valueType: 'option',
      width: '8%',
      align: 'center',
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          onClick={() => openDetail(r)}
        >
          详情
        </Button>
      ),
    },
  ];

  const payload = detail ? parsePayload(detail) : null;
  const isSelf =
    detail?.applicantId != null && detail.applicantId === currentUserId;
  const canAct = String(detail?.status ?? '') === '1';

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
          style={{ display: 'flex', gap: 8, marginBottom: 8, flexShrink: 0 }}
        >
          <Select
            allowClear
            style={{ width: 140 }}
            placeholder="状态（默认待确认）"
            options={[
              { value: '1', label: '待确认' },
              { value: '2', label: '已通过' },
              { value: '3', label: '已驳回' },
              { value: '4', label: '已超时' },
            ]}
            value={status}
            onChange={(v) => setStatus(v)}
          />
          <Button type="primary" onClick={doSearch}>
            查询
          </Button>
          <Button
            onClick={() => {
              setStatus(undefined);
              filterRef.current = {};
              actionRef.current?.reloadAndRest?.();
            }}
          >
            重置
          </Button>
        </div>
        <div className="group-table-fill">
          <FillTable
            pro
            headerTitle="合规确认单"
            rowKey={(r: ConfirmVO) => String(r.id)}
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
                const res = await fetchConfirmPage({
                  page: params.current ?? 1,
                  size: params.pageSize ?? 10,
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
      <Drawer
        title={`确认单详情${detail ? ` · ${detail.confirmNo}` : ''}`}
        open={!!detail}
        onClose={() => setDetail(null)}
        size={560}
        destroyOnHidden
        footer={
          canAct && detail ? (
            <Space style={{ float: 'right' }}>
              <Tooltip
                title={isSelf ? '复核人不能与操作人相同（4303）' : undefined}
              >
                <Button
                  type="primary"
                  disabled={isSelf}
                  onClick={() => doApprove(detail)}
                >
                  通过并执行
                </Button>
              </Tooltip>
              <Button danger onClick={() => doReject(detail)}>
                驳回
              </Button>
            </Space>
          ) : null
        }
      >
        {detail && (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="业务类型">
                {renderConfirmBizType(detail.bizType)}
              </Descriptions.Item>
              <Descriptions.Item label="摘要">
                {detail.bizSummary || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {renderConfirmStatus(detail.status)}
              </Descriptions.Item>
              <Descriptions.Item label="申请人">
                {detail.applicantName || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="超时时间">
                {fmtFull(detail.expireTime)}
              </Descriptions.Item>
              {detail.rejectReason && (
                <Descriptions.Item label="驳回原因">
                  <Typography.Text type="danger">
                    {detail.rejectReason}
                  </Typography.Text>
                </Descriptions.Item>
              )}
            </Descriptions>
            <div style={{ fontWeight: 600, margin: '16px 0 8px' }}>
              变更影响清单
            </div>
            {payload ? (
              payload.grants ? (
                <>
                  {payload.grants.map((g) => (
                    <div
                      key={g.targetId}
                      style={{
                        padding: '6px 0',
                        borderBottom: '1px solid #f0f0f0',
                      }}
                    >
                      <Space size={6} wrap>
                        <span>{g.roleName || `#${g.targetId}`}</span>
                        {g.critical && <Tag color="red">关键权限</Tag>}
                        {g.dataScope != null && (
                          <Tag color="cyan">
                            {renderDataScopeText(g.dataScope)}
                          </Tag>
                        )}
                        <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                          {g.validFrom ?? '-'} ~ {g.validTo ?? '-'}
                        </span>
                      </Space>
                    </div>
                  ))}
                  {payload.criticalMenus?.length ? (
                    <div style={{ marginTop: 8 }}>
                      <Tag color="volcano">关键菜单</Tag>
                      {payload.criticalMenus.join('、')}
                    </div>
                  ) : null}
                </>
              ) : (
                (payload.members ?? []).map((m) => (
                  <div
                    key={m.userId}
                    style={{
                      padding: '6px 0',
                      borderBottom: '1px solid #f0f0f0',
                    }}
                  >
                    {m.name}（{m.account}）
                  </div>
                ))
              )
            ) : (
              <div style={{ color: '#bfbfbf' }}>
                影响清单解析失败或为空（payload 脏数据防御）
              </div>
            )}
          </>
        )}
      </Drawer>
      {detailLoading && null}
    </PageFill>
  );
}
