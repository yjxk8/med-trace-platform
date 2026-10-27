/**
 * 新建出入库单 —— 重设计版（对标参考稿「新建入库待办」弹窗）
 *
 * 旧版（ModalForm + ProFormList 竖排小输入框）的问题：明细没有表格语义、药品纯手敲无联想、
 * 方向/发收方是三个孤立下拉，填完看不到「货从哪到哪」。
 *
 * 新版交互（用户目标：方便实用、一目了然）：
 * 1. Drawer 920（与详情抽屉同构）：上半头部表单，下半「药品列表」表格行内编辑；
 * 2. 发货方 ⇄ 收货方（可一键交换）+ FlowCard 实时渲染「出→入」物理流向；
 * 3. 药品名称 AutoComplete 联想，选中自动带出 规格/单位/系数/零售价/批次/效期（均可改）；
 * 4. 行尾 ± 圆钮（+ 下方插行 / − 删本行，至少留一行），表尾「添加药品」兜底；
 * 5. 底部常驻操作条：左实时小计（种数/数量合计），右 取消/确认（提交 loading）。
 *
 * 边界与坑位（沿用模块纪律）：
 * - 坑#5：明细不传 inoutNo/miId（服务端强制填充）；
 * - §6.7-#7 金额计算规则未定 → 前端不算金额、不显示金额合计；
 * - §6.7-#8 药品选择器数据源未交付 → searchDrugs 缺省时退化为手输名称，接口到位在父页一行接入；
 * - ioType 字典 YN0.2.14 未交付 → 「单据类型」字段随 IO_TYPE_LABELS 填充自动出现/隐藏。
 */
import {
  MinusCircleOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  App,
  AutoComplete,
  Button,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tooltip,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { createDrugTransfer } from '@/services/drugTransfer';
import { dash, FlowCard, IO_TYPE_LABELS } from './shared';

/** 药品联想候选（与服务端字典字段对齐；§6.7-#8 交付后由接口返回） */
export interface DrugCandidate {
  drugCode: string;
  drugName: string;
  spec?: string;
  ioUnit?: string;
  factor?: number;
  retailPrice?: number;
  batchNumber?: string;
  expiryDate?: string;
}

/** 明细草稿行（key 仅前端定位用，不参与提交） */
interface DraftItem {
  key: number;
  drugCode?: string;
  drugName?: string;
  spec?: string;
  count?: number | null;
  ioUnit?: string;
  factor?: number;
  retailPrice?: number;
  batchNumber?: string;
  expiryDate?: string;
}

interface CreateDocDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 创建成功回调（父级负责刷新列表与统计） */
  onCreated: () => void;
  /** 库房下拉：复用列表页已加载的 deptOptions（同源不重复请求） */
  deptOptions: { label: string; value: string }[];
  /** 药品联想数据源：支持同步数组（本地过滤）或异步 Promise（服务端检索）；缺省 → 手输 */
  searchDrugs?: (keyword: string) => Promise<DrugCandidate[]> | DrugCandidate[];
  /** 操作人默认值（当前登录人姓名） */
  operatorName?: string;
}

const IO_TYPE_OPTIONS = Object.entries(IO_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export default function CreateDocDrawer({
  open,
  onClose,
  onCreated,
  deptOptions,
  searchDrugs,
  operatorName,
}: CreateDocDrawerProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const seqRef = useRef(1);
  const nextKey = () => seqRef.current++;
  const [items, setItems] = useState<DraftItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  /** 行内药品联想：每行独立候选/加载态；250ms 防抖 */
  const [optMap, setOptMap] = useState<
    Record<number, { loading: boolean; list: DrugCandidate[] }>
  >({});
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const direction = Form.useWatch('ioDirection', form) as string | undefined;
  const inCode = Form.useWatch('inPharmacyCode', form) as string | undefined;
  const outCode = Form.useWatch('outPharmacyCode', form) as string | undefined;
  const nameOf = (code?: string) =>
    deptOptions.find((o) => o.value === code)?.label;

  // 打开即重置：新建不残留上次草稿（Drawer 不依赖 destroyOnClose，手动兜底）
  useEffect(() => {
    if (!open) return;
    seqRef.current = 1;
    setItems([{ key: nextKey() }]);
    setOptMap({});
    form.resetFields();
    form.setFieldsValue({
      ioDirection: '1',
      ...(operatorName ? { operatorName } : {}),
    });
    return () => {
      timersRef.current.forEach((t) => {
        clearTimeout(t);
      });
      timersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patchRow = (key: number, patch: Partial<DraftItem>) =>
    setItems((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );

  const insertAfter = (index: number) =>
    setItems((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, { key: nextKey() });
      return next;
    });

  const removeRow = (key: number) =>
    setItems((prev) =>
      prev.length > 1 ? prev.filter((r) => r.key !== key) : prev,
    );

  const handleDrugSearch = (key: number, kw: string) => {
    const t = timersRef.current.get(key);
    if (t) clearTimeout(t);
    if (!searchDrugs || !kw.trim()) {
      setOptMap((m) => ({ ...m, [key]: { loading: false, list: [] } }));
      return;
    }
    setOptMap((m) => ({
      ...m,
      [key]: { loading: true, list: m[key]?.list ?? [] },
    }));
    timersRef.current.set(
      key,
      setTimeout(() => {
        Promise.resolve(searchDrugs(kw.trim()))
          .then((list) =>
            setOptMap((m) => ({
              ...m,
              [key]: { loading: false, list: list ?? [] },
            })),
          )
          .catch(() =>
            setOptMap((m) => ({ ...m, [key]: { loading: false, list: [] } })),
          );
      }, 250),
    );
  };

  /** 选中候选：自动带出规格/单位/系数/零售价/批次/效期（均可手改） */
  const handleDrugSelect = (key: number, o: DrugCandidate) =>
    patchRow(key, {
      drugCode: o.drugCode,
      drugName: o.drugName,
      spec: o.spec,
      ioUnit: o.ioUnit,
      factor: o.factor,
      retailPrice: o.retailPrice,
      ...(o.batchNumber ? { batchNumber: o.batchNumber } : {}),
      ...(o.expiryDate ? { expiryDate: o.expiryDate } : {}),
    });

  /** 调拨反向录入时一键对调发/收方 */
  const swapParties = () => {
    const { inPharmacyCode, outPharmacyCode } = form.getFieldsValue([
      'inPharmacyCode',
      'outPharmacyCode',
    ]);
    form.setFieldsValue({
      inPharmacyCode: outPharmacyCode,
      outPharmacyCode: inPharmacyCode,
    });
  };

  const filledRows = items.filter(
    (r) => (r.drugName ?? '').trim() || r.drugCode,
  );
  const totalQty = filledRows.reduce((s, r) => s + (r.count ?? 0), 0);

  const handleSubmit = async () => {
    let head: Record<string, unknown>;
    try {
      head = await form.validateFields();
    } catch {
      return; // 头部校验错误已在表单内标红
    }
    if (!filledRows.length) {
      message.warning('请至少填写一种药品');
      return;
    }
    const bad = filledRows.find((r) => !r.count || r.count <= 0);
    if (bad) {
      message.warning(
        `「${(bad.drugName ?? '未命名药品').trim()}」请填写大于 0 的数量`,
      );
      return;
    }
    if (head.inPharmacyCode === head.outPharmacyCode) {
      message.warning('发货方与收货方不能相同');
      return;
    }

    setSubmitting(true);
    try {
      await createDrugTransfer({
        ...head,
        operatorName: String(head.operatorName ?? '').trim() || undefined,
        // 坑#5：明细不传 inoutNo/miId（服务端强制填充）；key 等前端辅助字段不透传
        // 效期统一 yyyy-MM-dd 字符串提交（与列表筛选坑#4 同口径）
        items: filledRows.map((r) => ({
          drugCode: r.drugCode,
          drugName: (r.drugName ?? '').trim(),
          count: r.count as number,
          ioUnit: r.ioUnit,
          factor: r.factor,
          batchNumber: r.batchNumber,
          expiryDate: r.expiryDate,
          retailPrice: r.retailPrice,
        })),
      });
      message.success('创建成功');
      onCreated();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title={direction === '0' ? '新建出库单' : '新建入库单'}
      width={920}
      open={open}
      onClose={onClose}
      maskClosable={false}
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ color: '#8c8c8c', fontSize: 13 }}>
            已填 {filledRows.length} 种药品 · 数量合计 {totalQty}
          </span>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              确认创建
            </Button>
          </Space>
        </div>
      }
    >
      {/* ===== 头部表单 ===== */}
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col flex="1 1 0">
            <Form.Item
              name="ioDirection"
              label="单据方向"
              rules={[{ required: true, message: '请选择方向' }]}
            >
              <Segmented
                block
                options={[
                  { label: '入库', value: '1' },
                  { label: '出库', value: '0' },
                ]}
              />
            </Form.Item>
          </Col>
          {/* ioType 字典（YN0.2.14）交付后此字段自动出现，与列表/详情同源 */}
          {IO_TYPE_OPTIONS.length > 0 && (
            <Col flex="1 1 0">
              <Form.Item name="ioType" label="单据类型">
                <Select
                  placeholder="请选择"
                  allowClear
                  options={IO_TYPE_OPTIONS}
                />
              </Form.Item>
            </Col>
          )}
          <Col flex="1 1 0">
            <Form.Item name="deptCode" label="执行科室">
              <Select
                placeholder="可选"
                allowClear
                showSearch
                optionFilterProp="label"
                options={deptOptions}
              />
            </Form.Item>
          </Col>
          <Col flex="1 1 0">
            <Form.Item name="operatorName" label="操作人">
              <Input placeholder="经办人姓名" allowClear />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={10}>
            <Form.Item
              name="outPharmacyCode"
              label={
                <span style={{ color: '#d46b08' }}>发货方（出库库房）</span>
              }
              rules={[{ required: true, message: '请选择发货方' }]}
            >
              <Select
                placeholder="请选择发货库房"
                showSearch
                optionFilterProp="label"
                options={deptOptions}
              />
            </Form.Item>
          </Col>
          {/* paddingTop 30 ≈ 竖排 label 行高+边距，让按钮与输入框齐平 */}
          <Col span={4} style={{ textAlign: 'center', paddingTop: 30 }}>
            <Tooltip title="交换发货方 / 收货方（调拨反向录入时一键对调）">
              <Button icon={<SwapOutlined />} onClick={swapParties} />
            </Tooltip>
          </Col>
          <Col span={10}>
            <Form.Item
              name="inPharmacyCode"
              label={
                <span style={{ color: '#0958d9' }}>收货方（入库库房）</span>
              }
              rules={[{ required: true, message: '请选择收货方' }]}
            >
              <Select
                placeholder="请选择收货库房"
                showSearch
                optionFilterProp="label"
                options={deptOptions}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      {/* 流向实时预览：左出（发货）→ 右入（收货），与详情抽屉同款组件 */}
      <FlowCard outName={nameOf(outCode)} inName={nameOf(inCode)} />

      {/* ===== 药品列表（表格行内编辑，对标参考稿） ===== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '4px 0 10px',
        }}
      >
        <div
          style={{
            width: 4,
            height: 15,
            borderRadius: 2,
            background: '#1677ff',
          }}
        />
        <span style={{ fontSize: 15, fontWeight: 600 }}>药品列表</span>
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>
          {searchDrugs
            ? '支持名称/拼音联想，选中自动带出规格、单位'
            : '输入药品名称（联想数据源接入后自动带出规格、单位）'}
        </span>
      </div>

      <Table<DraftItem>
        size="middle"
        rowKey="key"
        pagination={false}
        dataSource={items}
        scroll={{ x: 860 }}
        footer={() => (
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() => insertAfter(items.length - 1)}
          >
            添加药品
          </Button>
        )}
        columns={[
          {
            title: '#',
            width: 44,
            align: 'center',
            render: (_: unknown, __: DraftItem, idx: number) => idx + 1,
          },
          {
            title: '药品名称',
            dataIndex: 'drugName',
            render: (_: unknown, r: DraftItem) => (
              <AutoComplete
                style={{ width: '100%' }}
                value={r.drugName}
                placeholder={
                  searchDrugs ? '名称/拼音检索，如 sftn' : '输入药品名称'
                }
                filterOption={false}
                notFoundContent={
                  searchDrugs
                    ? optMap[r.key]?.loading
                      ? '检索中…'
                      : '无匹配药品'
                    : null
                }
                options={(optMap[r.key]?.list ?? []).map((o) => ({
                  value: o.drugName,
                  raw: o,
                  label: (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        maxWidth: 420,
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {o.drugName}
                      </span>
                      <span
                        style={{
                          color: '#8c8c8c',
                          fontSize: 12,
                          flexShrink: 0,
                        }}
                      >
                        {dash(o.spec)}
                      </span>
                    </div>
                  ),
                }))}
                onSearch={(kw: string) => handleDrugSearch(r.key, kw)}
                onSelect={(_v: string, opt: unknown) => {
                  const raw = (opt as { raw?: DrugCandidate }).raw;
                  if (raw) handleDrugSelect(r.key, raw);
                }}
                onChange={(v: string) => patchRow(r.key, { drugName: v })}
              />
            ),
          },
          {
            title: '规格',
            dataIndex: 'spec',
            width: 120,
            render: (_: unknown, r: DraftItem) => (
              <Input
                value={r.spec}
                placeholder="自动带出，可改"
                onChange={(e) => patchRow(r.key, { spec: e.target.value })}
              />
            ),
          },
          {
            title: '数量',
            dataIndex: 'count',
            width: 100,
            align: 'right',
            render: (_: unknown, r: DraftItem) => (
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                precision={0}
                placeholder="0"
                value={r.count ?? undefined}
                onChange={(v) => patchRow(r.key, { count: v })}
              />
            ),
          },
          {
            title: '单位',
            dataIndex: 'ioUnit',
            width: 84,
            render: (_: unknown, r: DraftItem) => (
              <Input
                value={r.ioUnit}
                placeholder="自动带出"
                onChange={(e) => patchRow(r.key, { ioUnit: e.target.value })}
              />
            ),
          },
          {
            title: '批次号',
            dataIndex: 'batchNumber',
            width: 118,
            render: (_: unknown, r: DraftItem) => (
              <Input
                value={r.batchNumber}
                placeholder="无批次填 -"
                onChange={(e) =>
                  patchRow(r.key, { batchNumber: e.target.value })
                }
              />
            ),
          },
          {
            title: '有效期',
            dataIndex: 'expiryDate',
            width: 136,
            render: (_: unknown, r: DraftItem) => (
              <DatePicker
                style={{ width: '100%' }}
                value={r.expiryDate ? dayjs(r.expiryDate) : undefined}
                onChange={(d: Dayjs | null) =>
                  patchRow(r.key, { expiryDate: d?.format('YYYY-MM-DD') })
                }
              />
            ),
          },
          {
            title: '操作',
            key: 'ops',
            width: 84,
            align: 'center',
            render: (_: unknown, r: DraftItem, idx: number) => (
              <Space size={0}>
                <Tooltip title="在此行下方插入一行">
                  <Button
                    type="text"
                    size="small"
                    icon={
                      <PlusCircleOutlined
                        style={{ color: '#1677ff', fontSize: 18 }}
                      />
                    }
                    onClick={() => insertAfter(idx)}
                  />
                </Tooltip>
                <Tooltip title="删除本行">
                  <Button
                    type="text"
                    size="small"
                    danger
                    disabled={items.length <= 1}
                    icon={<MinusCircleOutlined style={{ fontSize: 18 }} />}
                    onClick={() => removeRow(r.key)}
                  />
                </Tooltip>
              </Space>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
