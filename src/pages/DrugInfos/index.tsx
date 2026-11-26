/**
 * 药品字典(列表页)—— 用户管理范式
 * ★本轮调整(2026-11-26):
 * ①满屏修复:补 .drug-table-fill 类名 + index.less 表体定高规则——
 *   antd scroll.y 只是 max-height(行少塌陷),定高靠 less 把 body height 锁成 var(--ubody-h);
 *   JS 侧 ResizeObserver 测量契约与用户管理完全同构
 * ②批量启停:工具条停用/启用按钮升级为批量(选中均为"在用"→停用可用;均为"停用"→启用可用;
 *   混合状态双禁用,对齐用户管理 canLock/canUnlock 口径);接口 batchSetDrugUseStatus
 *   部分成功模式(成功/失败计数+failList),后端未实现前调用报错属预期
 * ③字典编码按 mdm_dict_type.csv 定版(见 dictCodes.ts):单位列 G10/G21 存量 value
 *   翻译后显示名称;剂型接 PT0.2.11
 * 红线不变:作废=软删;停用=选药下拉不再出现——确认文案沿用原文;机构数据域/⑬清选中/
 * ⑱单击勾选双击编辑/⑯像素列宽/⑰20行每页/⑲表体定高
 */
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { App, Button, Empty, Input, Modal, Select, Tag } from 'antd';
import type { CSSProperties, Key, MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import { useDict } from '@/hooks/useDict';
import type { DrugInfosItem } from '@/services/drugInfos';
import {
  batchSetDrugUseStatus,
  pageDrugInfos,
  voidDrug,
} from '@/services/drugInfos';
import { useOrgId } from '@/utils/orgContext';
import { DRUG_DICT } from './dictCodes';
import SaveForm from './SaveForm';
import './index.less'; // ★①满屏修复:表体定高规则(.drug-table-fill .ant-table-body height)

/** 表头+分页+边距扣减常数(⑲ 微调口诀:分页被裁→调大;下方见缝→调小) */
const TABLE_CHROME = 96;

export default function DrugInfosPage() {
  const { message } = App.useApp();

  // ===== 机构数据域(响应式):药品为机构级数据 =====
  const orgId = useOrgId();
  const miId = orgId != null && Number(orgId) > 0 ? Number(orgId) : null;
  const miIdRef = useRef<number | null>(miId);
  miIdRef.current = miId;
  const actionRef = useRef<ActionType | undefined>(undefined);

  // ===== ★字典翻译(剂型/单位存字典 code;batchTranslate 一次拉全量本地匹配,坑#9)=====
  const { batchTranslate } = useDict();
  const [dosageLabels, setDosageLabels] = useState<Record<string, string>>({});
  const [unitLabels, setUnitLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    // 失败静默:列显示原始 code,不阻断页面
    batchTranslate(DRUG_DICT.dosageForm)
      .then(setDosageLabels)
      .catch(() => {});
    batchTranslate(DRUG_DICT.unit)
      .then(setUnitLabels)
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== ⑲表体定高测量契约(与用户管理同构;高度喂给 --ubody-h + scroll.y)=====
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

  // ===== 筛选态(state 控 UI,filterRef 供 request 读取)=====
  const [stdCode, setStdCode] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  const filterRef = useRef<{
    phamStdCode?: string;
    keyword?: string;
    drugUseStatus?: string;
  }>({});
  const doSearch = () => {
    filterRef.current = {
      phamStdCode: stdCode.trim() || undefined,
      keyword: keyword.trim() || undefined,
      // ⚠️ drugUseStatus 服务端过滤需列表接口支持【待确认】;不支持时删本行+状态 Select
      drugUseStatus: status,
    };
    actionRef.current?.reloadAndRest?.();
  };
  const doReset = () => {
    setStdCode('');
    setKeyword('');
    setStatus(undefined);
    filterRef.current = {};
    actionRef.current?.reloadAndRest?.();
  };

  // ===== 行选择(⑬任何 request 清空;⑱单击行切换/双击编辑)=====
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<DrugInfosItem[]>([]);
  const clearSelection = () => {
    setSelectedKeys([]);
    setSelectedRows([]);
  };
  const rowSelection = {
    selectedRowKeys: selectedKeys,
    columnWidth: 32,
    onChange: (keys: readonly Key[], rows: readonly DrugInfosItem[]) => {
      setSelectedKeys(keys.map(String));
      setSelectedRows([...rows]);
    },
  };
  const toggleRow = (r: DrugInfosItem) => {
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
  const onRow = (r: DrugInfosItem) => ({
    onClick: (e: ReactMouseEvent<HTMLElement>) => {
      const el = e.target as HTMLElement;
      if (el.closest('.ant-table-selection-column')) return;
      toggleRow(r);
    },
    onDoubleClick: () => {
      openEdit(r);
    },
  });

  // ===== 机构切换响应(保险通道)=====
  const prevMiRef = useRef<number | null>(miId);
  useEffect(() => {
    if (prevMiRef.current === miId) return;
    prevMiRef.current = miId;
    if (miId == null) return;
    setStdCode('');
    setKeyword('');
    setStatus(undefined);
    filterRef.current = {};
    clearSelection();
    actionRef.current?.reloadAndRest?.();
  }, [miId]);

  // ===== 编辑弹窗(编辑-only)=====
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const openEdit = (r: DrugInfosItem) => {
    if (miId == null) return;
    setEditingId(r.id);
    setFormOpen(true);
  };

  const handleVoid = (row: DrugInfosItem) => {
    Modal.confirm({
      title: `作废药品「${row.phamName ?? row.phamStdCode}」?`,
      content: '作废后列表不再显示（软删，详情仍可见），确认作废？',
      okText: '作废',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await voidDrug(row.id);
          message.success('已作废');
          clearSelection();
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message || '作废失败');
          throw e;
        }
      },
    });
  };

  // ===== ★②批量启停(部分成功模式;门控对齐用户管理 canLock/canUnlock 全同状态口径)=====
  const n = selectedRows.length;
  const canStop =
    n > 0 &&
    miId != null &&
    selectedRows.every((r) => String(r.drugUseStatus) === '1');
  const canStart =
    n > 0 &&
    miId != null &&
    selectedRows.every((r) => String(r.drugUseStatus) !== '1');
  const single = n === 1 ? selectedRows[0] : null;

  const batchToggleStatus = (stop: boolean) => {
    const rows = stop
      ? selectedRows.filter((r) => String(r.drugUseStatus) === '1')
      : selectedRows;
    if (rows.length === 0) return;
    const ids = rows.map((r) => Number(r.id));
    Modal.confirm({
      title: stop ? `停用 ${ids.length} 个药品?` : `启用 ${ids.length} 个药品?`,
      content: stop
        ? '停用后选药下拉中将不再出现这些药品，确认停用？'
        : '启用后恢复在选药下拉中出现，确认启用？',
      okText: stop ? '停用' : '启用',
      okButtonProps: stop ? { danger: true } : undefined,
      onOk: async () => {
        try {
          const res = await batchSetDrugUseStatus({
            drugIds: ids,
            drugUseStatus: stop ? 0 : 1,
          });
          // 部分成功:失败条目逐条给原因(首条),完整明细后端可扩展结果弹窗
          if (res && res.failCount > 0) {
            const first = res.failList?.[0]?.reason;
            message.warning(
              `成功 ${res.successCount} 条,失败 ${res.failCount} 条${first ? `:${first}` : ''}`,
            );
          } else {
            message.success(
              res?.message || (stop ? '已批量停用' : '已批量启用'),
            );
          }
          clearSelection();
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message || '批量操作失败');
          throw e;
        }
      },
    });
  };

  // ===== 列定义(⑯像素宽;剂型/单位已接字典翻译)=====
  const columns: ProColumns<DrugInfosItem>[] = [
    {
      title: '药品编码',
      dataIndex: 'phamStdCode',
      width: 170,
      align: 'center',
      copyable: true,
      ellipsis: true,
      render: (_, r) => r.phamStdCode || '-',
    },
    {
      title: '药品名称',
      dataIndex: 'phamName',
      width: 240,
      align: 'center',
      ellipsis: true,
      render: (_, r) => r.phamName || '-',
    },
    {
      title: '规格',
      dataIndex: 'phamSpec',
      width: 160,
      align: 'center',
      ellipsis: true,
      render: (_, r) => r.phamSpec || '-',
    },
    {
      title: '剂型',
      dataIndex: 'dosageForm',
      width: 120,
      align: 'center',
      ellipsis: true,
      // ★字典翻译(PT0.2.11);历史自由文本/未命中 → 原样回显
      render: (_, r) =>
        r.dosageForm
          ? (dosageLabels[String(r.dosageForm)] ?? r.dosageForm)
          : '-',
    },
    {
      title: '单位',
      dataIndex: 'phamUnit',
      width: 100,
      align: 'center',
      ellipsis: true,
      // ★字典翻译(PT0.2.23):存量 value G10/G21 → 名称
      render: (_, r) =>
        r.phamUnit ? (unitLabels[String(r.phamUnit)] ?? r.phamUnit) : '-',
    },
    {
      title: '价格',
      dataIndex: 'retailPrice',
      width: 100,
      align: 'center',
      render: (_, r) =>
        r.retailPrice != null && r.retailPrice !== '' ? r.retailPrice : '-',
    },
    {
      title: '状态',
      dataIndex: 'drugUseStatus',
      width: 100,
      align: 'center',
      render: (_, r) => (
        <Tag color={String(r.drugUseStatus) === '1' ? 'green' : 'default'}>
          {String(r.drugUseStatus) === '1' ? '在用' : '停用'}
        </Tag>
      ),
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
            style={{ width: 200 }}
            placeholder="药品编码"
            value={stdCode}
            onChange={(e) => setStdCode(e.target.value)}
            onPressEnter={doSearch}
          />
          <Input
            allowClear
            style={{ width: 200 }}
            placeholder="药品名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={doSearch}
          />
          <Select
            allowClear
            style={{ width: 110 }}
            placeholder="状态"
            value={status}
            onChange={(v) => setStatus(v)}
            options={[
              { value: '1', label: '在用' },
              { value: '0', label: '停用' },
            ]}
          />
          <Button type="primary" onClick={doSearch}>
            查询
          </Button>
          <Button onClick={doReset}>重置</Button>
        </div>

        {/* 工具条:★②停用/启用升级为批量(选中 1 项走同接口亦可) */}
        <div className="drug-toolbar">
          <span className="drug-toolbar__title">药品列表</span>
          <span className="drug-toolbar__divider" />
          <Button
            type="text"
            icon={<EditOutlined />}
            title="编辑（选中 1 项，或双击行）"
            disabled={single == null || miId == null}
            onClick={() => {
              if (single) openEdit(single);
            }}
          />
          <Button
            type="text"
            icon={<StopOutlined />}
            title="批量停用（选中均为“在用”时可用）"
            disabled={!canStop}
            onClick={() => batchToggleStatus(true)}
          />
          <Button
            type="text"
            icon={<CheckCircleOutlined />}
            title="批量启用（选中均为“停用”时可用）"
            disabled={!canStart}
            onClick={() => batchToggleStatus(false)}
          />
          <span className="drug-toolbar__divider" />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            title="作废（选中 1 项，软删）"
            disabled={single == null || miId == null}
            onClick={() => {
              if (single) handleVoid(single);
            }}
          />
          <Button
            type="text"
            icon={<ReloadOutlined />}
            title="刷新"
            onClick={() => actionRef.current?.reload()}
          />
          {selectedKeys.length > 0 && (
            <span className="drug-toolbar__selchip">
              已选 {selectedKeys.length} 项<a onClick={clearSelection}>清空</a>
            </span>
          )}
        </div>

        {/* ⑲★①表格填充区:--ubody-h 由本处写入,index.less 锁 body 高度(满屏修复核心) */}
        <div
          ref={tableFillRef}
          className="drug-table-fill"
          style={tableFillStyle}
        >
          <FillTable
            pro
            rowKey={(r: DrugInfosItem) => String(r.id)}
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
            scroll={{ x: 990, y: tableBodyHeight }}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无药品"
                />
              ),
            }}
            request={async (params: {
              current?: number;
              pageSize?: number;
            }) => {
              clearSelection(); // ⑬任何重查清空选中
              const cur = miIdRef.current;
              if (cur == null) {
                return { data: [], total: 0, success: false };
              }
              try {
                const res = await pageDrugInfos({
                  page: params.current ?? 1,
                  size: params.pageSize ?? 20,
                  miId: cur,
                  ...filterRef.current,
                });
                return { data: res.records, total: res.total, success: true };
              } catch (e) {
                message.error((e as Error).message || '加载失败');
                return { data: [], total: 0, success: false };
              }
            }}
          />
        </div>
      </div>

      <SaveForm
        open={formOpen}
        editingId={editingId}
        miId={miId}
        onClose={() => setFormOpen(false)}
        onSuccess={() => {
          setFormOpen(false);
          actionRef.current?.reload();
        }}
      />
    </PageFill>
  );
}
