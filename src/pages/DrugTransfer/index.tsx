/**
 * 药品出入库列表页（txn 模块）—— 纯单据视图版
 * 数据源：/api/drug-transfer/page（平铺 IPage，total=单据数）+ 行懒展开明细（/drug-transfer/{id}）
 *
 * 列结构（11 列）：
 *   [单据编号(含HIS二行)][方向][类型][收货方][发货方][执行对象(弹性,含药柜二行)]
 *   [经办人][验收人(含第二验收)][状态(单据+打印)][创建时间][操作(图标)]
 *   - 药品名称/数量不在主表展示（用户要求），明细统一走行首 + 展开（懒加载+cache）
 *   - 类型=字典 YN0.2.14，值域待后端补充（§6.7-2），确认后填 IO_TYPE_LABELS 即出中文
 *
 * ⚠️ TS：FillTable 非泛型，回调参数必须显式注解（rowKey/onRow/expandable/request/showTotal）
 * ⚠️ 列宽纪律：执行对象为唯一弹性列；增删列必须同步改 scroll.x（= 固定列合计 + 弹性列保底）
 */

import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  PrinterOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import {
  App,
  Button,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import {
  type DrugIoExtendBrief,
  type DrugTransferDetail,
  type DrugTransferDetailItem,
  type DrugTransferItem,
  type DrugTransferPageQuery,
  deleteDrugTransfer,
  getDrugTransferDetail,
  getTransferStats,
  markPrinted,
  pageDrugTransfer,
} from '@/services/drugTransfer';
import { listPharmacyOptions } from '@/services/org/dept';
import CreateDocDrawer from './CreateDoc';
import {
  dash,
  FlowCard,
  fmtFull,
  IO_TYPE_LABELS,
  renderBatch,
  renderCheckStatus,
  renderDirection,
  renderDocStatus,
  renderExpiry,
  renderExtendOperation,
  renderExtendStatus,
  renderPrintBadge,
} from './shared';

// ==================== 常量 ====================

/**
 * 出入库类型字典 YN0.2.14 —— ⚠️ 值域待后端补充（交接文档 §6.7-2，未交付）
 * 拿到值域后在此填入 { code: 中文名 }，类型列/详情即自动出中文；此前显示原始值
 */

const DIRECTION_OPTIONS = [
  { label: '入库', value: '1' },
  { label: '出库', value: '0' },
];
const STATUS_OPTIONS = [
  { label: '待确认', value: '1' },
  { label: '已提交', value: '2' },
];

interface FilterFormValues {
  inoutNo?: string;
  deptCode?: string;
  ioDirection?: string;
  inoutStatus?: string;
  range?: [Dayjs, Dayjs] | null;
}

// ==================== 展开行明细表（药品/数量的唯一展示处） ====================

const previewColumns: ColumnsType<DrugTransferDetailItem> = [
  { title: '药品名称', dataIndex: 'drugName', width: 170, ellipsis: true },
  {
    title: '数量',
    dataIndex: 'count',
    width: 80,
    align: 'right',
    render: (_, r) => (r.count != null ? `${r.count}${dash(r.ioUnit)}` : '-'),
  },
  {
    title: '基本数量',
    dataIndex: 'quantity',
    width: 85,
    align: 'right',
    render: (_, r) => r.quantity ?? '-',
  },
  {
    title: '批次号',
    dataIndex: 'batchNumber',
    width: 110,
    render: (_, r) => renderBatch(r.batchNumber ?? ''),
  },
  {
    title: '有效期',
    dataIndex: 'expiryDate',
    width: 150,
    render: (_, r) => renderExpiry(r.expiryDate),
  },
  {
    title: '生产厂家',
    dataIndex: 'phamFactoryName',
    ellipsis: true,
    render: (_, r) => dash(r.phamFactoryName),
  },
];

function ItemsPreview({
  items,
  loading,
}: {
  items: DrugTransferDetailItem[];
  loading: boolean;
}) {
  if (loading)
    return (
      <div style={{ padding: '8px 0', color: '#999', fontSize: 12 }}>
        明细加载中…
      </div>
    );
  if (!items.length)
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无明细" />;
  return (
    <Table
      size="small"
      pagination={false}
      dataSource={items}
      columns={previewColumns}
      rowKey={(_: DrugTransferDetailItem, i?: number) => String(i)}
    />
  );
}

// ==================== 页面 ====================

export default function DrugTransferList() {
  const { message } = App.useApp();
  const { initialState } = useModel('@@initialState');
  // InitialState 生成类型未收敛用户字段（user/currentUser 双兜底，§6.2 宽松读取惯例）；
  // unknown 中转双跳，禁裸 as any（坑 §5-6）
  const userState = initialState as unknown as
    | { user?: { uName?: string }; currentUser?: { uName?: string } }
    | undefined;
  const currentUserName =
    userState?.user?.uName ?? userState?.currentUser?.uName;
  const [form] = Form.useForm<FilterFormValues>();
  const actionRef = useRef<ActionType | undefined>(undefined);

  /** 筛选快照：变更即 reloadAndRest 回第 1 页 */
  const filterRef = useRef<DrugTransferPageQuery>({});

  const [stats, setStats] = useState({
    todayIn: 0,
    todayOut: 0,
    pending: 0,
    monthCount: 0,
  });
  const loadStats = async () => {
    try {
      setStats(await getTransferStats());
    } catch {
      /* 统计失败不阻塞列表 */
    }
  };
  useEffect(() => {
    loadStats();
  }, []);
  // ===== 科室下拉数据源（复用 dept 模块，与 drugStock 药房下拉同源；deptType 混入护理单元的问题已知待收口） =====
  const [deptOptions, setDeptOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [deptLoading, setDeptLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setDeptLoading(true);
    listPharmacyOptions()
      .then((opts) => {
        if (!cancelled) setDeptOptions(opts);
      })
      .catch(() => {
        /* 静默：下拉是增强信息，不阻塞列表 */
      })
      .finally(() => {
        if (!cancelled) setDeptLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // ===== 行懒展开明细：cache 防重复请求 =====
  const [itemsCache, setItemsCache] = useState<
    Map<number, DrugTransferDetailItem[]>
  >(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const fetchItems = async (id: number) => {
    if (itemsCache.has(id) || loadingIds.has(id)) return;
    setLoadingIds((prev) => new Set(prev).add(id));
    try {
      const d = await getDrugTransferDetail(id);
      setItemsCache((prev) => new Map(prev).set(id, d.details ?? []));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoadingIds((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  };

  // ===== 详情抽屉 =====
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<DrugTransferDetail>();
  const openDetail = async (id: number) => {
    try {
      setDetail(await getDrugTransferDetail(id));
      setDetailOpen(true);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  // ===== 新建弹窗 =====
  const [createOpen, setCreateOpen] = useState(false);

  // ===== 操作 =====
  const handlePrint = async (id: number) => {
    try {
      await markPrinted(id);
      message.success('已标记打印');
      actionRef.current?.reload(); // print_status/count 已变，刷新当前页（不回第 1 页）
      loadStats();
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const handleDelete = async (id: number) => {
    try {
      await deleteDrugTransfer(id);
      message.success('删除成功');
      actionRef.current?.reload();
      loadStats();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  // ===== 筛选 =====
  const applyFilter = (patch: Partial<DrugTransferPageQuery>) => {
    filterRef.current = { ...filterRef.current, ...patch };
    actionRef.current?.reloadAndRest?.();
  };
  const onSearch = (v: FilterFormValues) => {
    filterRef.current = {
      inoutNo: v.inoutNo?.trim() || undefined,
      deptCode: v.deptCode || undefined,
      ioDirection: v.ioDirection || undefined,
      inoutStatus: v.inoutStatus || undefined,
      beginTime: v.range?.[0]?.format('YYYY-MM-DD'), // 坑#4：yyyy-MM-dd，两端含当天
      endTime: v.range?.[1]?.format('YYYY-MM-DD'),
    };
    actionRef.current?.reloadAndRest?.();
  };

  const onReset = () => {
    form.resetFields();
    filterRef.current = {};
    actionRef.current?.reloadAndRest?.();
  };

  // ===== 列定义 =====
  const columns: ProColumns<DrugTransferItem>[] = [
    {
      title: '单据编号',
      dataIndex: 'inoutNo',
      width: 200, // 容纳 20 字符 HIS 单号不折行（截图折行修复点）
      render: (_, r) => (
        <div style={{ lineHeight: '17px', whiteSpace: 'nowrap' }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {r.inoutNo}
          </div>
          <div
            style={{
              fontSize: 12,
              color: '#8c8c8c',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={`HIS：${dash(r.hisInoutNo)}`}
          >
            HIS {dash(r.hisInoutNo)}
          </div>
        </div>
      ),
    },
    {
      title: '方向',
      dataIndex: 'ioDirection',
      width: 56,
      render: (_, r) => renderDirection(r.ioDirection),
    },
    {
      // 类型：字典 YN0.2.14 值域未交付，先显原始值；确认后填 IO_TYPE_LABELS 即出中文
      title: '类型',
      dataIndex: 'ioType',
      width: 84,
      ellipsis: true,
      render: (_, r) => dash(IO_TYPE_LABELS[r.ioType ?? ''] ?? r.ioType),
    },
    // 收货方/发货方双向展示：入库看收货方、出库看发货方，另一侧 '-'
    {
      title: '收货方',
      dataIndex: 'inPharmacyName',
      width: 105,
      ellipsis: true,
      render: (_, r) => dash(r.inPharmacyName),
    },
    {
      title: '发货方',
      dataIndex: 'outPharmacyName',
      width: 105,
      ellipsis: true,
      render: (_, r) => dash(r.outPharmacyName),
    },
    {
      // ⚠️ 唯一弹性列：不设 width，容器多余宽度全落这里；第二行灰字显示病区备用药柜
      title: '科室',
      dataIndex: 'deptName',
      render: (_, r) => (
        <div style={{ lineHeight: '16px' }}>
          <div
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={r.deptName ?? ''}
          >
            {r.isMedicineBox === '1' && (
              <Tag color="blue" style={{ marginRight: 4 }}>
                箱
              </Tag>
            )}
            {dash(r.deptName)}
          </div>
          {r.medicineCabinetName && (
            <div
              style={{
                fontSize: 12,
                color: '#8c8c8c',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={r.medicineCabinetName}
            >
              药柜 {r.medicineCabinetName}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '经办人',
      dataIndex: 'operatorName',
      width: 66,
      ellipsis: true,
      render: (_, r) => dash(r.operatorName),
    },
    {
      // 验收人（麻精双人验收合规）：第二验收人灰字第二行
      title: '验收人',
      width: 66,
      render: (_, r) => (
        <div
          style={{ lineHeight: '15px', fontSize: 12 }}
          title={`验收：${dash(r.checkName)} / 第二验收：${dash(r.checkName2)}`}
        >
          <div
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {dash(r.checkName)}
          </div>
          {r.checkName2 && (
            <div
              style={{
                color: '#8c8c8c',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {r.checkName2}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '状态',
      width: 98,
      render: (_, r) => (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            alignItems: 'flex-start',
          }}
        >
          {renderDocStatus(r.inoutStatus)}
          {renderPrintBadge(r.printStatus, r.printCount)}
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 135,
      render: (_, r) => fmtFull(r.createTime),
    },
    {
      // 操作图标化：悬停 Tooltip 出文字说明；编辑仅草稿单可见
      title: '操作',
      valueType: 'option',
      width: 118,
      fixed: 'right',
      render: (_, r) => (
        <Space size={2}>
          <Tooltip title="查看">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openDetail(r.id)}
            />
          </Tooltip>
          <Tooltip title="标记打印">
            <Button
              type="text"
              size="small"
              icon={<PrinterOutlined />}
              onClick={() => handlePrint(r.id)}
            />
          </Tooltip>
          {r.inoutStatus === '1' && (
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() =>
                  message.info(
                    '编辑页开发中（items 三态坑#2 方案随编辑页落地）',
                  )
                }
              />
            </Tooltip>
          )}
          <Popconfirm
            title={
              r.inoutStatus === '2'
                ? '该单据已提交，删除为物理删除且不可恢复（含全部明细），确定继续？'
                : '确定删除该单据及全部明细？（物理删除，不可恢复）'
            }
            okText="删除"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(r.id)}
          >
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];
  // 行高压紧（与库存页同款）：表头 10px / 数据行 6px
  columns.forEach((c) => {
    c.onHeaderCell = () => ({ style: { padding: '10px 8px' } });
    c.onCell = () => ({ style: { padding: '6px 8px' } });
  });

  // ===== KPI 配置 =====
  const kpis = [
    {
      title: '今日入库（笔）',
      value: stats.todayIn,
      icon: <ArrowLeftOutlined />,
      bg: '#1677ff',
    },
    {
      title: '今日出库（笔）',
      value: stats.todayOut,
      icon: <ArrowRightOutlined />,
      bg: '#16a34a',
    },
    {
      title: '待确认单据',
      value: stats.pending,
      icon: <FileTextOutlined />,
      bg: '#fa8c16',
    },
    {
      title: '本月单据（笔）',
      value: stats.monthCount,
      icon: <AppstoreOutlined />,
      bg: '#722ed1',
    },
  ];

  return (
    <PageFill>
      {/* ===== 统计卡 ===== */}
      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
        {kpis.map((k) => (
          <div
            key={k.title}
            style={{
              flex: 1,
              background: '#fff',
              borderRadius: 8,
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: k.bg,
                color: '#fff',
                fontSize: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {k.icon}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}>
                {k.value}
              </div>
              <div style={{ color: '#8c8c8c', fontSize: 13 }}>{k.title}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== 筛选栏：方向/状态/打印状态即选即搜；单号回车或按钮搜；日期区间即选即搜 ===== */}
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: '10px 16px',
          flexShrink: 0,
        }}
      >
        <Form form={form} layout="inline" onFinish={onSearch}>
          <Form.Item name="inoutNo" style={{ marginBottom: 0 }}>
            <Input
              placeholder="单据编号（模糊）"
              allowClear
              style={{ width: 180 }}
            />
          </Form.Item>
          <Form.Item name="deptCode" style={{ marginBottom: 0 }}>
            <Select
              placeholder="科室"
              allowClear
              showSearch
              optionFilterProp="label"
              loading={deptLoading}
              options={deptOptions}
              style={{ width: 170 }}
              onChange={(v) => applyFilter({ deptCode: v || undefined })}
            />
          </Form.Item>
          <Form.Item name="ioDirection" style={{ marginBottom: 0 }}>
            <Select
              placeholder="方向"
              allowClear
              options={DIRECTION_OPTIONS}
              style={{ width: 95 }}
              onChange={(v) => applyFilter({ ioDirection: v || undefined })}
            />
          </Form.Item>
          <Form.Item name="inoutStatus" style={{ marginBottom: 0 }}>
            <Select
              placeholder="状态"
              allowClear
              options={STATUS_OPTIONS}
              style={{ width: 95 }}
              onChange={(v) => applyFilter({ inoutStatus: v || undefined })}
            />
          </Form.Item>
          <Form.Item name="range" style={{ marginBottom: 0 }}>
            <DatePicker.RangePicker
              style={{ width: 240 }}
              onChange={(_, strs) =>
                applyFilter({
                  beginTime: strs?.[0] || undefined,
                  endTime: strs?.[1] || undefined,
                })
              }
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
            查询
          </Button>
          <Button style={{ marginLeft: 8 }} onClick={onReset}>
            重置
          </Button>
          <Button
            style={{ marginLeft: 8 }}
            type="primary"
            ghost
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建单据
          </Button>
        </Form>
      </div>

      {/* ===== 表格卡片 ===== */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          background: '#fff',
          borderRadius: 8,
          padding: '2px 16px 4px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <FillTable
          pro
          reservedHeight={160}
          headerTitle="出入库单据"
          rowKey="id"
          actionRef={actionRef}
          columns={columns}
          search={false}
          options={{ reload: true, density: false, setting: false }}
          cardBordered={false}
          // 固定列合计 1063 + 执行对象保底 ~100；容器更窄出滚动条时降到 1063
          scroll={{ x: 1160 }}
          expandable={{
            // ⚠️ FillTable 无泛型，参数显式注解（TS7006）；药品/数量的唯一展示处
            expandedRowRender: (r: DrugTransferItem) => (
              <ItemsPreview
                items={itemsCache.get(r.id) ?? []}
                loading={loadingIds.has(r.id)}
              />
            ),
            onExpand: (expanded: boolean, r: DrugTransferItem) => {
              if (expanded) fetchItems(r.id);
            },
          }}
          request={async (params: { current?: number; pageSize?: number }) => {
            try {
              const res = await pageDrugTransfer({
                ...filterRef.current,
                page: params.current ?? 1,
                size: params.pageSize ?? 10,
              });
              return {
                data: res.records ?? [],
                total: res.total ?? 0,
                success: true,
              };
            } catch (e) {
              message.error((e as Error).message); // 500 toast 原文；401 拦截器处理
              return { data: [], total: 0, success: false };
            }
          }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
          }}
        />
      </div>

      {/* ===== 详情抽屉：流向对照卡 + 头信息 + 明细全量表 + HIS 扩展单区 ===== */}
      <Drawer
        width={880}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={`出入库单 ${detail?.inoutNo ?? ''}`}
      >
        {/* 流向对照：左出库（发货）→ 右入库（收货） */}
        <FlowCard
          outName={detail?.outPharmacyName}
          inName={detail?.inPharmacyName}
        />

        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="出入库编号">
            {detail?.inoutNo}
          </Descriptions.Item>
          <Descriptions.Item label="HIS编号">
            {dash(detail?.hisInoutNo)}
          </Descriptions.Item>
          <Descriptions.Item label="方向">
            {renderDirection(detail?.ioDirection)}
          </Descriptions.Item>
          <Descriptions.Item label="类型">
            {dash(IO_TYPE_LABELS[detail?.ioType ?? ''] ?? detail?.ioType)}
          </Descriptions.Item>
          <Descriptions.Item label="科室">
            {dash(detail?.deptName)}
            {detail?.isMedicineBox === '1' && '（小药箱）'}
          </Descriptions.Item>
          <Descriptions.Item label="病区备用药柜">
            {dash(detail?.medicineCabinetName)}
          </Descriptions.Item>
          <Descriptions.Item label="操作人">
            {detail?.operatorName
              ? `${detail.operatorNo ?? ''} ${detail.operatorName}`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="单据状态">
            {renderDocStatus(detail?.inoutStatus)}
          </Descriptions.Item>
          <Descriptions.Item label="验收人">
            {dash(detail?.checkName)}
          </Descriptions.Item>
          <Descriptions.Item label="第二验收人">
            {dash(detail?.checkName2)}
          </Descriptions.Item>
          <Descriptions.Item label="打印">
            {renderPrintBadge(detail?.printStatus, detail?.printCount) ??
              '未打印'}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {fmtFull(detail?.createTime)}
          </Descriptions.Item>
        </Descriptions>

        <Table
          style={{ marginTop: 16 }}
          size="small"
          pagination={false}
          rowKey={(_: DrugTransferDetailItem, i?: number) => String(i)}
          dataSource={detail?.details ?? []}
          scroll={{ x: 860 }}
          columns={[
            { title: '药品编码', dataIndex: 'drugCode', width: 90 },
            {
              title: '药品名称',
              dataIndex: 'drugName',
              width: 150,
              ellipsis: true,
            },
            {
              title: '数量',
              width: 75,
              align: 'right',
              render: (_, r: DrugTransferDetailItem) =>
                r.count != null ? `${r.count}${dash(r.ioUnit)}` : '-',
            },
            {
              title: '基本数量',
              dataIndex: 'quantity',
              width: 80,
              align: 'right',
              render: (_, r: DrugTransferDetailItem) => r.quantity ?? '-',
            },
            {
              title: '零售价',
              dataIndex: 'retailPrice',
              width: 75,
              align: 'right',
            },
            {
              title: '零售金额',
              dataIndex: 'retailAmount',
              width: 85,
              align: 'right',
            },
            {
              title: '批次号',
              dataIndex: 'batchNumber',
              width: 110,
              render: (_, r) => renderBatch(r.batchNumber ?? ''),
            },
            {
              title: '有效期',
              dataIndex: 'expiryDate',
              width: 140,
              render: (_, r: DrugTransferDetailItem) =>
                renderExpiry(r.expiryDate),
            },
            {
              title: '处方/申请单号',
              width: 130,
              ellipsis: true,
              render: (_, r: DrugTransferDetailItem) =>
                dash(
                  [r.prescriptionNos, r.reqNos].filter(Boolean).join(' / ') ||
                    null,
                ),
            },
            {
              title: '厂家',
              dataIndex: 'phamFactoryName',
              ellipsis: true,
              render: (_, r: DrugTransferDetailItem) => dash(r.phamFactoryName),
            },
          ]}
        />

        {/* HIS 扩展单区（ioext 集成）：详情 #3 按 hisInoutNo 反查回传；无 HIS 单号整块隐藏（文档 P1） */}
        {detail?.hisInoutNo && (
          <>
            <Divider
              titlePlacement="start"
              orientationMargin={0}
              style={{ marginTop: 20 }}
            >
              HIS 扩展单（来源，共 {detail.hisExt?.length ?? 0} 条）
            </Divider>
            {detail.hisExt?.length ? (
              <Table
                size="small"
                pagination={false}
                rowKey={(r: DrugIoExtendBrief, i?: number) =>
                  r.id != null ? String(r.id) : String(i)
                }
                dataSource={detail.hisExt}
                scroll={{ x: 1000 }}
                columns={[
                  {
                    title: 'HIS 单号',
                    dataIndex: 'orderNumber',
                    width: 150,
                    ellipsis: true,
                  },
                  {
                    title: '方向',
                    dataIndex: 'operationType',
                    width: 70,
                    render: (_, r: DrugIoExtendBrief) =>
                      renderExtendOperation(r.operationType),
                  },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    width: 70,
                    render: (_, r: DrugIoExtendBrief) =>
                      renderExtendStatus(r.status),
                  },
                  {
                    title: '验收状态',
                    dataIndex: 'checkStatus',
                    width: 88,
                    render: (_, r: DrugIoExtendBrief) =>
                      renderCheckStatus(r.checkStatus),
                  },
                  {
                    title: '供货商',
                    dataIndex: 'supplier',
                    width: 110,
                    ellipsis: true,
                    render: (_, r: DrugIoExtendBrief) => dash(r.supplier),
                  },
                  {
                    title: '配送单号',
                    dataIndex: 'deliveryOrderNumber',
                    width: 120,
                    ellipsis: true,
                    render: (_, r: DrugIoExtendBrief) =>
                      dash(r.deliveryOrderNumber),
                  },
                  {
                    title: 'HIS 库房（出→入）',
                    width: 180,
                    ellipsis: true,
                    render: (_, r: DrugIoExtendBrief) =>
                      `${dash(r.outPharmacyName)} → ${dash(r.inPharmacyName)}`,
                  },
                  {
                    title: '操作人',
                    dataIndex: 'operatorName',
                    width: 80,
                    render: (_, r: DrugIoExtendBrief) => dash(r.operatorName),
                  },
                  {
                    title: '操作时间',
                    dataIndex: 'operatorTime',
                    width: 140,
                    render: (_, r: DrugIoExtendBrief) =>
                      fmtFull(r.operatorTime),
                  },
                ]}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="未关联 HIS 扩展单"
              />
            )}
          </>
        )}
      </Drawer>

      {/* ===== 新建弹窗：骨架。阻塞项（§6.7）：#7 金额/数量计算规则、#8 药品选择器数据源；
           坑#5 明细不传 inoutNo/miId（服务端强制填充）===== */}
      {/* ===== 新建单据：重设计版（Drawer + 表格行内编辑 + 流向卡），实现见 CreateDoc.tsx ===== */}
      <CreateDocDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          actionRef.current?.reloadAndRest?.();
          loadStats();
        }}
        deptOptions={deptOptions}
        operatorName={currentUserName}
        // TODO(§6.7-#8)：药品选择器数据源接口交付后一行接入，例如：
        // searchDrugs={(kw) => searchDrugCatalog({ keyword: kw, size: 20 })} // 返回 DrugCandidate[]
      />
    </PageFill>
  );
}
