/**
 * 字典管理页（左右结构·左类型右数据）
 * 本次调整：
 * ★1 平台标准数据限制全部放开（用户决策：字典管理权限走页面级授权，前端不再按
 *   platform 禁用按钮）：类型/字典项的新增、编辑、删除对平台行全部可用；
 *   编辑态 dictCode/miId disabled 属后端数据锁定（非权限）保留；DataModal 平台提示
 *   Alert 保留为纯提示（不阻断），提交由后端守卫兜底（4601 指引 toast 透传）
 * ★2 名称列加粗醒目：fontWeight 600 + 主文本色 rgba(0,0,0,0.88)
 * 保留：视口层纵向滚动（表头 sticky + 中和 FillTable 内部限高，不依赖其 scroll 行为）、
 * 自管分页（gotoPage 改 ref→reload）、百分比列宽无横向滚动、通栏钉底分页、
 * miId 阻断态、删除确认契约原文、4604 并发删除自动刷新
 */
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
  Alert,
  App,
  Button,
  Empty,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import { useDict } from '@/hooks/useDict';
import {
  DICT_ERR,
  type DictDataVO,
  type DictItemVO,
  type DictTypeVO,
  deleteDictData,
  getBizCode,
  getDictTypeOptions,
  pageDictData,
  setDictDataStatus,
} from '@/services/dict';
import { useOrgId } from '@/utils/orgContext';
import { STATUS_META } from './constants';
import DataModal from './DataModal';
import { fmtFull, isOn, renderPlatform } from './shared';
import TypeList from './TypeList';
import TypeModal from './TypeModal';

/**
 * ★视口层滚动样式（作用域限定 .dict-data-viewport）：
 * 表头吸顶 + 中和内部限高（antd body/FillTable 注入的 max-height、overflow 强制放开），
 * 滚动条唯一出现在视口层
 */
const VIEWPORT_CSS = `
.dict-data-viewport .ant-table-thead > tr > th,
.dict-data-viewport .ant-table-header {
  position: sticky;
  top: 0;
  z-index: 3;
  background: #fafafa;
}
.dict-data-viewport .ant-table-body,
.dict-data-viewport .ant-table-container,
.dict-data-viewport .ant-table-wrapper {
  max-height: none !important;
  overflow: visible !important;
}
`;

/** 右栏查询条件快照（filterRef 范式；dictCode 由选中类型 key 重建承载） */
type DataFilterState = { keyword: string; status?: string };

export default function DictManage() {
  const { message } = App.useApp();
  const { invalidate } = useDict();

  const orgId = useOrgId();
  const miId = orgId != null && Number(orgId) > 0 ? Number(orgId) : null;

  // ===== 左栏（类型）状态 =====
  const [active, setActive] = useState<DictTypeVO | null>(null);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<DictTypeVO | null>(null);
  const [reloadSignal, setReloadSignal] = useState(0);

  // ===== 右栏（数据）状态 =====
  const [dataFilters, setDataFilters] = useState<DataFilterState>({
    keyword: '',
  });
  const dataFilterRef = useRef<DataFilterState>({ keyword: '' });
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<DictDataVO | null>(null);
  const [typeOptions, setTypeOptions] = useState<DictItemVO[]>([]);
  const actionRef = useRef<ActionType | undefined>(undefined);

  // 自管分页（ref = request 闭包唯一数据源；state = 分页条显示值）
  const pageRef = useRef(1);
  const pageSizeRef = useRef(20);
  const [dataPage, setDataPage] = useState(1);
  const [dataPageSize, setDataPageSize] = useState(20);
  const [dataTotal, setDataTotal] = useState(0);

  /** 分页唯一驱动入口：改 ref → 同步 state → reload()（不依赖 ProTable 内部分页） */
  const gotoPage = (p: number, ps?: number) => {
    pageRef.current = Math.max(1, p);
    if (ps != null) pageSizeRef.current = ps;
    setDataPage(pageRef.current);
    setDataPageSize(pageSizeRef.current);
    actionRef.current?.reload();
  };

  /** 右栏条件提交：条件写入 ref → 页码重置 1 → reload（规则10） */
  const commitDataFilters = (next: DataFilterState) => {
    dataFilterRef.current = next;
    setDataFilters(next);
    pageRef.current = 1;
    setDataPage(1);
    actionRef.current?.reload();
  };

  /** 左栏选中类型：同步重置右栏页码（先改 ref 再 setActive，key 重建后首查即第 1 页） */
  const handleSelectType = (t: DictTypeVO | null) => {
    pageRef.current = 1;
    setDataPage(1);
    setDataTotal(0);
    setActive(t);
  };

  // 机构切换：清空选中 + 重置右栏分页
  useEffect(() => {
    pageRef.current = 1;
    pageSizeRef.current = 20;
    setDataPage(1);
    setDataPageSize(20);
    setDataTotal(0);
    setActive(null);
  }, [miId]);

  // 类型下拉数据源（DataModal 用）；miId 响应式重载
  useEffect(() => {
    if (miId == null) {
      setTypeOptions([]);
      return;
    }
    getDictTypeOptions()
      .then(setTypeOptions)
      .catch((e) => message.error((e as Error).message));
  }, [miId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 右栏字典项操作 =====
  /** 启停（口语化文案；4604 → toast 后自动刷新） */
  const toggleData = (row: DictDataVO) => {
    const next = isOn(row.status) ? 1 : 0;
    Modal.confirm({
      title:
        next === 1
          ? `停用字典项「${row.dictLabel}」?`
          : `启用字典项「${row.dictLabel}」?`,
      content:
        next === 1
          ? '停用后，业务页的下拉选项和翻译将不再出现该值；已引用该值的历史数据仍按原值展示，不受影响。'
          : '启用后，该值会重新出现在业务页的下拉选项和翻译中。',
      okText: next === 1 ? '停用' : '启用',
      okButtonProps: next === 1 ? { danger: true } : undefined,
      onOk: async () => {
        try {
          const res = await setDictDataStatus(row.id, next as 0 | 1);
          message.success(res?.message ?? (next === 1 ? '已停用' : '已启用'));
          invalidate(row.dictCode);
          actionRef.current?.reload(); // 保持页码，不整页刷新
        } catch (e) {
          message.error((e as Error).message);
          if (getBizCode(e) === DICT_ERR.DATA_NOT_EXIST) {
            actionRef.current?.reload(); // 4604：通常并发已删 → 刷新列表；自动关确认框
            return;
          }
          throw e;
        }
      },
    });
  };

  /** 删除（契约要求确认文案必须含指定原文，不改；4604 → toast 后自动刷新） */
  const removeData = (row: DictDataVO) => {
    Modal.confirm({
      title: `删除字典项「${row.dictLabel}」?`,
      content:
        "删除后不可恢复;物理删除，已引用该值的历史数据将显示为'-'，建议改用停用。",
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await deleteDictData(row.id);
          message.success(res?.message ?? '删除成功');
          invalidate(row.dictCode);
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message);
          if (getBizCode(e) === DICT_ERR.DATA_NOT_EXIST) {
            actionRef.current?.reload();
            return;
          }
          throw e;
        }
      },
    });
  };

  // ===== 右栏列定义（★名称列加粗；百分比列宽合计 100%，无横向滚动） =====
  const dataColumns: ProColumns<DictDataVO>[] = [
    {
      title: '名称',
      dataIndex: 'dictLabel',
      width: '24%',
      ellipsis: true,
      // ★名称列加粗醒目：600 字重 + 主文本色；停用 Tag 随行展示
      render: (_, r) => (
        <Space size={4}>
          <span
            style={{
              fontWeight: 600,
              color: 'rgba(0,0,0,0.88)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {r.dictLabel ?? '-'}
          </span>
          {!isOn(r.status) && <Tag style={{ marginInlineEnd: 0 }}>停用</Tag>}
        </Space>
      ),
    },
    {
      title: '键值',
      dataIndex: 'dictValue',
      width: '9%',
      align: 'center',
      render: (_, r) => r.dictValue ?? '-', // 编码语义，字符串原样，禁止 Number 化
    },
    {
      title: '排序',
      dataIndex: 'dictSort',
      width: '7%',
      align: 'center',
      render: (_, r) => r.dictSort ?? '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: '9%',
      align: 'center',
      render: (_, r) => (
        <Switch
          size="small"
          checked={isOn(r.status)}
          onChange={() => toggleData(r)}
        />
      ),
    },
    {
      title: '标准',
      dataIndex: 'platform',
      width: '8%',
      align: 'center',
      render: (_, r) => renderPlatform(r.platform),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: '15%',
      ellipsis: true,
      render: (_, r) => r.remark || '-',
    },
    {
      title: '更新时间',
      dataIndex: 'updateTime',
      width: '16%',
      align: 'center',
      ellipsis: true,
      render: (_, r) => fmtFull(r.updateTime),
    },
    {
      title: '操作',
      valueType: 'option',
      width: '12%',
      align: 'center',
      // ⚠️ 第一参是 dom 节点，必须占位 _（历史坑）
      // ★平台限制放开：不再按 platform 禁用（权限走页面级授权）
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              style={{ padding: '0 4px' }}
              icon={<EditOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />}
              onClick={() => {
                setEditingData(r);
                setDataModalOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              type="text"
              size="small"
              danger
              style={{ padding: '0 4px' }}
              icon={<DeleteOutlined style={{ fontSize: 14 }} />}
              onClick={() => removeData(r)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // ===== miId 阻断态 =====
  if (miId == null) {
    return (
      <PageFill>
        <Alert
          type="warning"
          showIcon
          message="未选择机构,字典数据不可用"
          description="字典为机构级数据(管理分页接口 miId 必填)。请通过顶栏「切换机构」选择机构,选择后本页自动恢复(无需手动刷新);若顶栏无机构切换入口,说明当前账号未携带可用机构列表,请联系管理员分配机构后重新登录。"
        />
      </PageFill>
    );
  }

  return (
    <PageFill>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          background: '#fff',
          borderRadius: 8,
          padding: '12px 16px',
          display: 'flex',
          gap: 12,
          overflow: 'hidden',
        }}
      >
        {/* ===== 左栏：字典类型（树型分组） ===== */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            borderRight: '1px solid #f0f0f0',
            paddingRight: 12,
          }}
        >
          <TypeList
            active={active}
            onSelect={handleSelectType}
            onAdd={() => {
              setEditingType(null);
              setTypeModalOpen(true);
            }}
            onEdit={(t) => {
              setEditingType(t);
              setTypeModalOpen(true);
            }}
            reloadSignal={reloadSignal}
          />
        </div>

        {/* ===== 右栏：选中类型的字典项明细 ===== */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {active ? (
            <>
              {/* 第一段：筛选行 */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 8,
                  flexShrink: 0,
                  flexWrap: 'wrap',
                }}
              >
                <Input
                  allowClear
                  prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                  placeholder="名称/拼音"
                  style={{ width: 200 }}
                  value={dataFilters.keyword}
                  onChange={(e) =>
                    setDataFilters((p) => ({ ...p, keyword: e.target.value }))
                  }
                  onPressEnter={() => commitDataFilters(dataFilters)} // keyword 命中 dictLabel/pinyin
                />
                <Select
                  allowClear
                  placeholder="状态"
                  style={{ width: 110 }}
                  value={dataFilters.status}
                  options={STATUS_META}
                  onChange={(v) =>
                    commitDataFilters({ ...dataFilters, status: v })
                  }
                />
                <Button
                  type="primary"
                  onClick={() => commitDataFilters(dataFilters)}
                >
                  查询
                </Button>
                <Button onClick={() => commitDataFilters({ keyword: '' })}>
                  重置
                </Button>
              </div>

              {/* 第二段：工具条行（★新增不再按平台类型禁用） */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  flexShrink: 0,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontWeight: 600 }}>字典项</span>
                <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
                  {active.dictName}（{active.dictCode}）
                </span>
                {active.platform && <Tag color="gold">标准</Tag>}
                {!isOn(active.status) && <Tag>停用</Tag>}
                <span style={{ flex: 1 }} />
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditingData(null);
                    setDataModalOpen(true);
                  }}
                >
                  新增
                </Button>
                <Button
                  type="text"
                  icon={<ReloadOutlined />}
                  title="刷新"
                  onClick={() => actionRef.current?.reload()}
                />
              </div>

              {/* ★表格视口：自己接管纵向滚动（overflowY auto），表头吸顶/内部限高由
                  VIEWPORT_CSS 处理；不依赖 FillTable 的 scroll 行为 */}
              <div
                className="dict-data-viewport"
                style={{
                  flex: 1,
                  minHeight: 0,
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                }}
              >
                <style>{VIEWPORT_CSS}</style>
                <FillTable
                  pro
                  key={`${miId}|${active.id}`}
                  reservedHeight={0}
                  // ⚠️ FillTable 无泛型，回调参数显式注解（TS7006）
                  rowKey={(r: DictDataVO) => String(r.id)}
                  actionRef={actionRef}
                  columns={dataColumns}
                  tableLayout="fixed"
                  // 不传 scroll（y 曾被 FillTable 覆盖致失效；滚动由视口层接管）
                  search={false}
                  options={false}
                  cardBordered={false}
                  pagination={false} // 内置分页关闭，分页由底部通栏条承担（自管状态驱动）
                  locale={{
                    emptyText: (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="暂无字典项"
                      >
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={() => {
                            setEditingData(null);
                            setDataModalOpen(true);
                          }}
                        >
                          新增字典项
                        </Button>
                      </Empty>
                    ),
                  }}
                  // request 不读 params（ProTable 内部分页不可靠），页码唯一来源 = 自管 ref
                  request={async () => {
                    const f = dataFilterRef.current;
                    const current = pageRef.current;
                    const size = pageSizeRef.current;
                    try {
                      const res = await pageDictData({
                        dictCode: active.dictCode, // 左侧选中类型锁定过滤
                        status: f.status,
                        keyword: f.keyword,
                        page: current,
                        size,
                      }); // miId 由服务层统一注入（租户铁律）
                      setDataTotal(res.total);
                      // 末页删空回退：一次性重查（无循环）
                      const lastPage = Math.max(1, Math.ceil(res.total / size));
                      if (res.records.length === 0 && current > lastPage) {
                        pageRef.current = lastPage;
                        setDataPage(lastPage);
                        actionRef.current?.reload();
                        return { data: [], total: res.total, success: true };
                      }
                      return {
                        data: res.records,
                        total: res.total,
                        success: true,
                      };
                    } catch (e) {
                      message.error((e as Error).message);
                      setDataTotal(0);
                      return { data: [], total: 0, success: false };
                    }
                  }}
                />
              </div>

              {/* 通栏分页条：钉在右栏底边，宽度=右栏 100% */}
              <div
                style={{
                  flexShrink: 0,
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: 'rgba(0,0,0,0.45)' }}>
                  共 {dataTotal} 条
                </span>
                <Pagination
                  size="small"
                  current={dataPage}
                  pageSize={dataPageSize}
                  total={dataTotal}
                  showSizeChanger
                  showQuickJumper
                  pageSizeOptions={[10, 20, 50]}
                  onChange={(p, ps) => gotoPage(p, ps)}
                />
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Empty description="请先在左侧选择字典类型" />
            </div>
          )}
        </div>
      </div>

      {/* ===== 弹窗（单例） ===== */}
      <TypeModal
        open={typeModalOpen}
        editing={editingType}
        onClose={() => setTypeModalOpen(false)}
        onSaved={() => {
          setTypeModalOpen(false);
          setReloadSignal((s) => s + 1);
        }}
      />
      <DataModal
        open={dataModalOpen}
        editing={editingData}
        dictCode={active?.dictCode}
        lockDictCode
        typeOptions={typeOptions}
        onClose={() => setDataModalOpen(false)}
        onSaved={() => {
          setDataModalOpen(false);
          actionRef.current?.reload();
        }}
      />
    </PageFill>
  );
}
