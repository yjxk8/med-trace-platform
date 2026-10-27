/**
 * 药品库存列表页（inv 模块，纯查询）
 * 数据源：/api/pharmacy-drug-stock/page-grouped（§2.1-1）
 *   - 组级分页：total = 组数，size = 每页组数；children 组内完整、永不跨页拆组
 *   - 分组/汇总一律后端算（架构铁律 §5-9）：组头四个汇总字段直绑，前端零计算
 *
 * 展示形态：树形表格 —— 组头行 colSpan 合并展示汇总，子行为批次明细
 *   实现说明：交接文档 P0-2 建议 flatMap 摊平 + colSpan；弃用摊平方案 ——
 *   摊平后 dataSource 长度（组头+子行）> pageSize 且 ≥ total 时触发 antd Table
 *   本地切片，翻页渲染错行。树形模式 dataSource 恒为组数 ≤ size，天然规避
 *
 * 列结构（10 列，2026-xx 调整：删除基本单位/包装单位/科室三列，单位拼进数量列）：
 *   [药品名称][规格][生产厂家][批次号][生产日期][有效期][库存数量][药箱][创建时间][操作]
 *   数量口径：组头 = 换算汇总「2盒7支」（formatTotalInventory）；子行 = 原始「27支」
 *   包装换算率（1 盒 = 10 支）仅在组头带第二行展示，无独立列
 *
 * 筛选：药房（下拉，数据源 = 现有 dept 模块 getDeptTree，切换联动 stats 口径）
 *   + 药品名称模糊查询（drugNameLike，防抖 300ms，§4-P1-5）
 *   其余后端已支持的筛选（keyword/drugCode/batchNumber/secondDeptCode/
 *   isMedicineBox/expiry 区间，§2.2）恢复时往 Form 里加回 + 往 filterRef 写入即可
 *
 * ⚠️ TS 注意：FillTable 非泛型组件，透传给 ProTable 的回调拿不到上下文类型，
 * 参数必须显式注解（否则 TS7006）。已注解清单（新增回调同样处理）：
 * rowKey(r) / onRow(r) / onExpandedRowsChange(keys) / request(params) / showTotal(t)
 *
 * ⚠️ 列变更铁律：增删列或调列序，必须同步重算 GROUP_SPANS（见列定义末尾），
 * 元素个数 = 列数、合并区连续无缝隙——本次错位就是删列后未同步导致的
 */

import { SearchOutlined } from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { App, Button, Form, Input, Select, Tag, Typography } from 'antd';
import type { Key } from 'react';
import { useEffect, useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import {
  type DrugStockGroupVO,
  type DrugStockListVO,
  type DrugStockPageQuery,
  getDrugStockPageGrouped,
} from '@/services/inv/drugStock';
import { listPharmacyOptions } from '@/services/org/dept';
import DrugStockDetailDrawer from './DetailDrawer';
import StatsCards from './StatsCards';
import {
  dash,
  expiryFlag,
  fmtDate,
  fmtFull,
  formatTotalInventory,
  renderBatch,
  renderExpiry,
  renderMedicineBox,
  truncateText,
} from './shared';

// ==================== 筛选 ====================

interface FilterFormValues {
  pharmacyCode?: string;
  drugName?: string;
}

// ==================== 行模型（纯结构转换，零聚合） ====================

/** 组头节点：后端 GroupVO 原样 + 树形标记 */
type GroupNode = DrugStockGroupVO & { isGroup: true };
/** 批次子行：后端 ListVO 原样 + 树形标记 */
type BatchNode = DrugStockListVO & { isGroup: false };
type StockNode = GroupNode | BatchNode;

/** 只加 isGroup 标记，不做任何聚合/排序（children 顺序由后端保证：批次号 '-' 在前 → id DESC） */
function toTreeData(groups: DrugStockGroupVO[]): StockNode[] {
  return groups.map((g) => ({
    ...g,
    isGroup: true,
    children: (g.children ?? []).map((c) => ({
      ...c,
      isGroup: false as const,
    })),
  }));
}

// ==================== 列定义 ====================

/** 组头汇总带（紧凑版）：规格/厂家截断防换行，悬停显示全文；第二行含包装换算率（无独立列，唯一出处） */
function renderGroupBand(g: GroupNode) {
  return (
    <div style={{ lineHeight: '19px', fontSize: 13 }}>
      <div>
        <span style={{ fontWeight: 600 }}>{dash(g.drugName)}</span>
        <span style={{ color: '#8c8c8c', marginLeft: 8 }}>
          {truncateText(g.drugSpec, 6)}
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#999' }}>
        {truncateText(g.phamFactoryName, 5)}
        {g.packageUnit && g.retailFactor
          ? ` · 1 ${g.packageUnit} =${g.retailFactor} ${g.drugUnit}`
          : ''}
        {` · ${dash(g.pharmacyName)}`}
      </div>
    </div>
  );
}

function buildColumns(onDetail: (id: number) => void): ProColumns<StockNode>[] {
  const cols: ProColumns<StockNode>[] = [
    // ⚠️ 唯一弹性列：不设 width，容器多余宽度全部落到这里（固定列已收紧，名称列通常能分到 250px+）
    {
      title: '药品名称',
      dataIndex: 'drugName',
      width: 130,
      render: (_, r) => (r.isGroup ? renderGroupBand(r) : ''),
    },
    // 子行名称/规格/厂家三字段后端恒 null（§2.3），不渲染
    { title: '规格', dataIndex: 'drugSpec', width: 100, render: () => '' },
    {
      title: '生产厂家',
      dataIndex: 'phamFactoryName',
      width: 100,
      ellipsis: true,
      render: () => '',
    },
    {
      title: '批次号',
      dataIndex: 'batchNumber',
      width: 120, // AB60303821（10 字符）不换行的最小宽度
      render: (_, r) =>
        r.isGroup ? <Tag>{r.batchCount} 批</Tag> : renderBatch(r.batchNumber),
    },
    {
      title: '生产日期',
      dataIndex: 'productionDate',
      width: 110,
      render: (_, r) => (r.isGroup ? '' : fmtDate(r.productionDate)),
    },
    {
      title: '有效期',
      dataIndex: 'expiryDate',
      width: 140,
      render: (_, r) => {
        if (!r.isGroup) return renderExpiry(r.expiryDate);
        if (r.allLongTerm || !r.nearestExpiry) return <Tag>长期</Tag>;
        return renderExpiry(r.nearestExpiry);
      },
    },
    // 数量列：组头 = 换算汇总「2盒7支」；子行 = 原始数量 + 基本单位「27支」
    // ⚠️ 0 是合法在库值；基本/包装单位已并入数量显示，无独立列
    {
      title: '库存数量',
      dataIndex: 'currentInventory',
      width: 110, // 「10盒8支」也能放下；右对齐保持数字右缘整齐
      align: 'right',
      render: (_, r) =>
        r.isGroup ? (
          <Typography.Text strong>
            {formatTotalInventory(
              r.totalInventory,
              r.packageUnit,
              r.retailFactor,
              r.drugUnit,
            )}
          </Typography.Text>
        ) : (
          `${r.currentInventory}${r.drugUnit}`
        ),
    },
    {
      title: '药箱',
      dataIndex: 'isMedicineBox',
      width: 120,
      render: (_, r) =>
        r.isGroup ? (
          r.medBoxCount > 0 ? (
            <Tag color="blue">药箱 ×{r.medBoxCount}</Tag>
          ) : (
            ''
          )
        ) : (
          renderMedicineBox(r.isMedicineBox)
        ),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 145,
      render: (_, r) => (r.isGroup ? '' : fmtFull(r.createTime)),
    },
    {
      title: '操作',
      valueType: 'option',
      fixed: 'right',
      width: 90,
      render: (_, r) =>
        r.isGroup
          ? ''
          : [
              <a key="detail" onClick={() => onDetail(r.id)}>
                详情
              </a>,
            ],
    },
  ];
  // 组头合并方案（必须连续，不能出现无覆盖的 0 格），与 cols 顺序一一对应，共 10 元素：
  // [名称×3(含规格/厂家)][批次×2(含生产日期)][有效期×1][库存×1][药箱×2(含创建时间)][操作×1] = 10 列
  // ⚠️ 增删列/调列序必须同步改这里（元素个数 = 列数），否则组头合并区整体错位
  const GROUP_SPANS = [3, 0, 0, 2, 0, 1, 1, 2, 0, 1];
  cols.forEach((c, i) => {
    // 行高压紧：antd 默认上下 padding 16px 是「行间距大」的根源，改为表头 10px / 数据行 6px
    // （内联样式优先级高于 antd 样式表，不依赖 FillTable 是否透传 size）
    c.onHeaderCell = () => ({ style: { padding: '10px 8px' } });
    c.onCell = (r: StockNode) =>
      r.isGroup
        ? { colSpan: GROUP_SPANS[i], style: { padding: '6px 8px' } }
        : { style: { padding: '6px 8px' } };
  });
  return cols;
}

// ==================== 页面 ====================

export default function DrugStockPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<FilterFormValues>();
  const actionRef = useRef<ActionType | undefined>(undefined);

  /** 筛选快照：药房切换/名称防抖/重置时更新 + reloadAndRest（回第 1 页） */
  const filterRef = useRef<DrugStockPageQuery>({});

  const [detailId, setDetailId] = useState<number | null>(null);

  /** 组展开状态（受控，键 = groupKey）：新数据到达后默认全展开 */
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);

  // ===== 药房下拉数据源（现有 dept 模块 getDeptTree，会话级缓存；失败静默 → 下拉为空但页面可用） =====
  const [pharmacyOptions, setPharmacyOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [deptLoading, setDeptLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDeptLoading(true);
    listPharmacyOptions()
      .then((opts) => {
        if (!cancelled) setPharmacyOptions(opts);
      })
      .catch(() => {
        /* 静默：下拉是增强信息，不阻塞列表主功能 */
      })
      .finally(() => {
        if (!cancelled) setDeptLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** drugNameLike 防抖 300ms（§4-P1-5）；清空立即恢复全量 */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyNameFilter = (name: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const v = name.trim();
    filterRef.current = { ...filterRef.current, drugNameLike: v || undefined };
    actionRef.current?.reloadAndRest?.();
  };
  const onNameChange = (v: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v) {
      applyNameFilter('');
      return;
    }
    timerRef.current = setTimeout(() => applyNameFilter(v), 300);
  };
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  /** stats 口径只认 miId + pharmacyCode（§2.3）→ 药房切换必须联动统计卡重拉 */
  const [statsPharmacyCode, setStatsPharmacyCode] = useState<
    string | undefined
  >(undefined);
  /** 重置时即使药房本来就未选也要刷一次 stats */
  const [statsKey, setStatsKey] = useState(0);

  const onPharmacyChange = (v: string | undefined) => {
    filterRef.current = { ...filterRef.current, pharmacyCode: v || undefined };
    setStatsPharmacyCode(v || undefined);
    actionRef.current?.reloadAndRest?.();
  };

  const columns = buildColumns(setDetailId);

  const toggleGroup = (key: string) => {
    setExpandedKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    );
  };

  const onReset = () => {
    form.resetFields();
    filterRef.current = {};
    setStatsPharmacyCode(undefined);
    setStatsKey((k) => k + 1);
    actionRef.current?.reloadAndRest?.();
  };

  return (
    <PageFill>
      {/* 统计卡跟随药房口径：选药房 → 按药房统计；清除/重置 → 全量 */}
      <StatsCards pharmacyCode={statsPharmacyCode} refreshKey={statsKey} />

      {/* ===== 筛选栏：药房下拉 + 药品名称模糊查询（防抖自动搜；回车/按钮立即搜） ===== */}
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: '10px 16px',
          flexShrink: 0,
        }}
      >
        {/* 不要给 Form 加 component={false} —— 会丢 ant-form-inline 包裹层导致竖排（历史坑） */}
        <Form
          form={form}
          layout="inline"
          onFinish={() => applyNameFilter(form.getFieldValue('drugName') ?? '')}
        >
          <Form.Item name="pharmacyCode" style={{ marginBottom: 0 }}>
            <Select
              placeholder="药房"
              allowClear
              showSearch
              optionFilterProp="label"
              loading={deptLoading}
              style={{ width: 220 }}
              options={pharmacyOptions}
              onChange={onPharmacyChange}
            />
          </Form.Item>
          <Form.Item name="drugName" style={{ marginBottom: 0 }}>
            <Input
              placeholder="药品名称 / 拼音首字母（如 zsy）"
              allowClear
              style={{ width: 280 }}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
            查询
          </Button>
          <Button style={{ marginLeft: 8 }} onClick={onReset}>
            重置
          </Button>
        </Form>
      </div>

      {/* ===== 表格卡片：占满剩余高度，表体内部滚动，分页固定 ===== */}
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
          reservedHeight={160} // 底部被裁/留白过大时微调此值
          headerTitle="库存查询"
          // ⚠️ FillTable 无泛型，回调参数必须显式注解（TS7006）
          rowKey={(r: StockNode) => (r.isGroup ? r.groupKey : String(r.id))}
          actionRef={actionRef}
          columns={columns}
          search={false}
          options={{ reload: true, density: false, setting: false }}
          cardBordered={false}
          scroll={{ x: 1100 }}
          expandable={{
            expandedRowKeys: expandedKeys,
            // ⚠️ 同上：keys 显式注解
            onExpandedRowsChange: (keys: Key[]) => setExpandedKeys([...keys]),
          }}
          onRow={(r: StockNode) => {
            if (r.isGroup)
              return {
                onClick: () => toggleGroup(r.groupKey),
                style: { cursor: 'pointer' },
              };
            // 批次行温和高亮：临期淡橙 / 过期淡红
            const flag = expiryFlag(r.expiryDate);
            if (flag === 'expired') return { style: { background: '#fff1f0' } };
            if (flag === 'near') return { style: { background: '#fff7e6' } };
            return {};
          }}
          request={async (params: { current?: number; pageSize?: number }) => {
            try {
              const res = await getDrugStockPageGrouped({
                ...filterRef.current,
                page: params.current ?? 1,
                size: params.pageSize ?? 10,
              });
              setExpandedKeys(res.records.map((g) => g.groupKey)); // 翻页/搜索后默认全展开
              return {
                data: toTreeData(res.records),
                total: res.total,
                success: true,
              };
            } catch (e) {
              message.error((e as Error).message); // 500 → toast（§4-P3-11）；401 由拦截器跳登录
              return { data: [], total: 0, success: false };
            }
          }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 组`, // total = 组数（§4-P0-4），文案勿写「条批次」
          }}
        />
      </div>

      <DrugStockDetailDrawer id={detailId} onClose={() => setDetailId(null)} />
    </PageFill>
  );
}
