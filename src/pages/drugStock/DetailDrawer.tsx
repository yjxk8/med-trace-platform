/**
 * 库存详情抽屉（只读）
 * 上：库存字段 Descriptions；下：追溯码实例 Table
 * 红线：
 * - barcode 等宽字体 + 一键复制；全程字符串，禁止数值化（含 '-1' 后缀形态）
 * - 两种日期格式并存：printTime 带 T（fmtFull）、实例生产/有效期纯日期（fmtDate）
 * - 实例空数组 → 空态文案，不报错
 * - 实例 status/drugUnitStatus 只读标签，不放任何流转操作入口（归打印/报损模块）
 * 契约（§2.3）：pharmacyName 由后端 join t_dept 回填，无匹配 null → '-'，勿回退编码丢行；
 *   secondDeptName 是否回填待后端决策（§3-7），落地后本文件同步改为名称优先
 */

import {
  Alert,
  App,
  Button,
  Descriptions,
  Divider,
  Drawer,
  Spin,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import {
  DRUG_UNIT_STATUS_MAP,
  type DrugInstanceListVO,
  type DrugStockDetailVO,
  getDrugStockDetail,
  PRINT_STATUS_MAP,
} from '@/services/inv/drugStock';
import {
  dash,
  fmtDate,
  fmtFull,
  renderBatch,
  renderEnumTag,
  renderExpiry,
  renderMedicineBox,
} from './shared';

/** 等宽字体：20 位条码字符等宽，杜绝换行/截断/抄错 */
const MONO_FONT =
  'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace';

function BarcodeCell({ value }: { value: string }) {
  return (
    <Typography.Text
      code
      copyable={{ text: value, tooltips: ['复制追溯码', '已复制'] }}
      style={{ fontFamily: MONO_FONT, fontSize: 12, whiteSpace: 'nowrap' }}
    >
      {value}
    </Typography.Text>
  );
}

const instanceColumns: ColumnsType<DrugInstanceListVO> = [
  {
    title: '追溯码',
    dataIndex: 'barcode',
    width: 200,
    fixed: 'left',
    render: (v) => <BarcodeCell value={v} />,
  },
  {
    title: '打印状态',
    dataIndex: 'status',
    width: 92,
    render: (v) => renderEnumTag(v, PRINT_STATUS_MAP),
  },
  {
    title: '码状态',
    dataIndex: 'drugUnitStatus',
    width: 92,
    render: (v) => renderEnumTag(v, DRUG_UNIT_STATUS_MAP),
  },
  {
    title: '批次号',
    dataIndex: 'batchNo',
    width: 104,
    render: (v) => renderBatch(v),
  },
  {
    title: '生产日期',
    dataIndex: 'productionDate',
    width: 106,
    render: (v) => fmtDate(v),
  },
  {
    title: '有效期',
    dataIndex: 'expiredTime',
    width: 106,
    render: (v) => fmtDate(v),
  },
  {
    title: '最近打印时间',
    dataIndex: 'printTime',
    width: 140,
    render: (v) => fmtFull(v),
  },
  {
    title: '作废原因',
    dataIndex: 'cancelReason',
    ellipsis: true,
    render: (v) => dash(v),
  },
];

interface Props {
  /** null = 关闭；非 null = 打开并加载该 id */
  id: number | null;
  onClose: () => void;
}

export default function DrugStockDetailDrawer({ id, onClose }: Props) {
  const { message } = App.useApp();
  const [data, setData] = useState<DrugStockDetailVO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadFlag, setReloadFlag] = useState(0);

  useEffect(() => {
    if (id === null) return;
    let cancelled = false; // 竞态守卫：连续切换详情行时丢弃过期响应
    setData(null); // 清掉上一单数据，防残影
    setError(null);
    setLoading(true);
    getDrugStockDetail(id)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message);
        message.error((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadFlag, message]);

  return (
    <Drawer
      title={data ? `库存详情（ID: ${data.id}）` : '库存详情'}
      width={960}
      open={id !== null}
      onClose={onClose}
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message="详情加载失败"
          description={error}
          action={
            <Button
              size="small"
              danger
              onClick={() => setReloadFlag((n) => n + 1)}
            >
              重试
            </Button>
          }
        />
      ) : (
        <Spin spinning={loading}>
          {data && (
            <>
              <Descriptions bordered size="small" column={3}>
                {/* pharmacyName 后端回填（t_dept）；null → '-'，勿回退显示编码 */}
                <Descriptions.Item label="药房">
                  {dash(data.pharmacyName)}
                </Descriptions.Item>
                <Descriptions.Item label="药品名称">
                  {dash(data.drugName)}
                </Descriptions.Item>
                <Descriptions.Item label="规格">
                  {dash(data.drugSpec)}
                </Descriptions.Item>
                <Descriptions.Item label="药品编码">
                  {data.drugCode}
                </Descriptions.Item>
                <Descriptions.Item label="生产厂家">
                  {dash(data.phamFactoryName)}
                </Descriptions.Item>
                <Descriptions.Item label="批次号">
                  {renderBatch(data.batchNumber)}
                </Descriptions.Item>
                <Descriptions.Item label="生产日期">
                  {fmtDate(data.productionDate)}
                </Descriptions.Item>
                <Descriptions.Item label="有效期">
                  {renderExpiry(data.expiryDate)}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">
                  {fmtFull(data.createTime)}
                </Descriptions.Item>
                {/* 0 是合法在库值，不走 dash；换算括号仅在双单位齐备时显示 */}
                <Descriptions.Item label="库存数量">
                  {data.currentInventory} {data.drugUnit}
                  {data.packageUnit && data.retailFactor ? (
                    <span style={{ color: '#999', marginLeft: 8 }}>
                      （1 {data.packageUnit} = {data.retailFactor}{' '}
                      {data.drugUnit}）
                    </span>
                  ) : null}
                </Descriptions.Item>
                <Descriptions.Item label="药箱">
                  {renderMedicineBox(data.isMedicineBox)}
                </Descriptions.Item>
                {/* secondDeptName 待后端决策（§3-7），暂显 code */}
                <Descriptions.Item label="科室/药箱">
                  {dash(data.secondDeptCode)}
                </Descriptions.Item>
              </Descriptions>

              <Typography.Title
                level={5}
                style={{ marginTop: 20, marginBottom: 12 }}
              >
                追溯码实例（{data.traceabilityInstances?.length ?? 0}）
              </Typography.Title>
              <Divider style={{ margin: '0 0 16px' }} />

              <Table<DrugInstanceListVO>
                rowKey="id"
                size="small"
                columns={instanceColumns}
                dataSource={data.traceabilityInstances ?? []}
                scroll={{ x: 940 }}
                pagination={{
                  pageSize: 10,
                  hideOnSinglePage: true,
                  showTotal: (t) => `共 ${t} 条`,
                }}
                locale={{ emptyText: '该库存暂无追溯码实例' }}
              />
            </>
          )}
        </Spin>
      )}
    </Drawer>
  );
}
