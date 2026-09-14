import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  FileTextOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
  ModalForm,
  PageContainer,
  ProFormDigit,
  ProFormList,
  ProFormSelect,
  ProFormText,
  ProTable,
} from '@ant-design/pro-components';
import {
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  message,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import {
  createDrugTransfer,
  type DrugTransferDetail,
  type DrugTransferItem,
  deleteDrugTransfer,
  getDrugTransferDetail,
  getTransferStats,
  markPrinted,
  pageDrugTransfer,
} from '@/services/drugTransfer';

/** 单据类型下拉（TODO: 按字典 YN0.2.14 的实际值替换 value） */
const IO_TYPE_OPTIONS = [
  { label: '采购入库', value: 'purchase' },
  { label: '调拨出库', value: 'transfer' },
  { label: '退药', value: 'return' },
];

const DrugTransferList: React.FC = () => {
  const actionRef = useRef<ActionType>();
  const [form] = Form.useForm();

  const [filters, setFilters] = useState<Record<string, any>>({});
  const [stats, setStats] = useState({
    todayIn: 0,
    todayOut: 0,
    pending: 0,
    monthCount: 0,
  });
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<DrugTransferDetail>();
  const [createOpen, setCreateOpen] = useState(false);

  const loadStats = async () => {
    try {
      setStats(await getTransferStats());
    } catch {
      /* 统计接口失败不阻塞页面 */
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  /** 打开详情抽屉 */
  const openDetail = async (id: number) => {
    setDetail(await getDrugTransferDetail(id));
    setDetailOpen(true);
  };

  /** 标记打印 */
  const handlePrint = async (id: number) => {
    await markPrinted(id);
    message.success('已标记打印');
    actionRef.current?.reload();
    loadStats();
  };

  /** 删除单据（头+明细） */
  const handleDelete = async (id: number) => {
    await deleteDrugTransfer(id);
    message.success('删除成功');
    actionRef.current?.reload();
    loadStats();
  };

  /** 状态标签：已提交→已入库/已出库；保存→待确认 */
  const renderStatus = (record: DrugTransferItem) => (
    <Space size={4}>
      {record.inoutStatus === '1' ? (
        <Tag color="orange">待确认</Tag>
      ) : record.ioDirection === '1' ? (
        <Tag color="green">已入库</Tag>
      ) : (
        <Tag color="green">已出库</Tag>
      )}
      {record.printStatus === '2' && <Tag>已打印</Tag>}
    </Space>
  );

  const columns: ProColumns<DrugTransferItem>[] = [
    {
      title: '单据编号',
      dataIndex: 'inoutNo',
      render: (_, record) => <b>{record.inoutNo}</b>,
    },
    {
      title: '类型',
      dataIndex: 'ioDirection',
      width: 90,
      render: (_, record) =>
        record.ioDirection === '1' ? (
          <Tag color="blue">入库</Tag>
        ) : (
          <Tag color="green">出库</Tag>
        ),
    },
    { title: '药品', dataIndex: 'firstDrugName', ellipsis: true },
    {
      title: '数量',
      dataIndex: 'totalCount',
      width: 100,
      render: (_, record) =>
        record.totalCount != null
          ? `${record.totalCount} ${record.firstIoUnit ?? ''}`
          : '-',
    },
    { title: '经办人', dataIndex: 'operatorName', width: 100 },
    {
      title: '时间',
      dataIndex: 'createTime',
      width: 90,
      render: (_, record) =>
        record.createTime ? dayjs(record.createTime).format('HH:mm') : '-',
    },
    {
      title: '状态',
      dataIndex: 'inoutStatus',
      width: 150,
      render: renderStatus,
    },
    {
      title: '操作',
      valueType: 'option',
      width: 140,
      render: (_, record) => (
        <Space>
          <a onClick={() => openDetail(record.id)}>查看</a>
          <a onClick={() => handlePrint(record.id)}>打印</a>
          <Popconfirm
            title="确定删除该单据及全部明细？"
            onConfirm={() => handleDelete(record.id)}
          >
            <a style={{ color: 'red' }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /** 顶部 4 张统计卡配置 */
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

  /** 筛选表单提交 → 更新 filters，ProTable 通过 params 自动重新请求 */
  const onSearch = (values: {
    inoutNo?: string;
    ioType?: string;
    inoutStatus?: string;
    date?: dayjs.Dayjs;
  }) => {
    setFilters({
      inoutNo: values.inoutNo,
      ioType: values.ioType,
      inoutStatus: values.inoutStatus,
      beginTime: values.date?.format('YYYY-MM-DD'),
      endTime: values.date?.format('YYYY-MM-DD'),
    });
  };

  return (
    <PageContainer title={false}>
      {/* ===== 统计卡片区 ===== */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        {kpis.map((k) => (
          <div
            key={k.title}
            style={{
              flex: 1,
              background: '#fff',
              borderRadius: 8,
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                background: k.bg,
                color: '#fff',
                fontSize: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {k.icon}
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.2 }}>
                {k.value}
              </div>
              <div style={{ color: '#8c8c8c', fontSize: 13 }}>{k.title}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== 筛选栏卡片 ===== */}
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <Form form={form} layout="inline" onFinish={onSearch}>
          <Form.Item name="inoutNo">
            <Input
              placeholder="请输入单据编号"
              style={{ width: 180 }}
              allowClear
            />
          </Form.Item>
          <Form.Item name="ioType">
            <Select
              placeholder="全部类型"
              style={{ width: 140 }}
              options={IO_TYPE_OPTIONS}
              allowClear
            />
          </Form.Item>
          <Form.Item name="inoutStatus">
            <Select
              placeholder="全部状态"
              style={{ width: 140 }}
              allowClear
              options={[
                { label: '保存', value: '1' },
                { label: '已提交', value: '2' },
              ]}
            />
          </Form.Item>
          <Form.Item name="date">
            <DatePicker style={{ width: 150 }} placeholder="日期" />
          </Form.Item>
          <Button type="primary" icon={<SearchOutlined />} htmlType="submit">
            搜索
          </Button>
          <Button
            style={{ marginLeft: 12 }}
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建单据
          </Button>
        </Form>
      </div>

      {/* ===== 表格卡片 ===== */}
      <ProTable<DrugTransferItem>
        headerTitle="出入库单据"
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        search={false} // 内置查询关闭，用上面的自定义筛选栏
        params={filters} // filters 变化自动触发重新请求
        options={false}
        cardBordered={false}
        request={async (params) => {
          const { current, pageSize, ...rest } = params;
          const res = await pageDrugTransfer({
            ...rest,
            page: current,
            size: pageSize,
          });
          return {
            data: res.records ?? [],
            total: res.total ?? 0,
            success: true,
          };
        }}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
        }}
        toolBarRender={() => [
          <span key="count" style={{ color: '#8c8c8c' }}>
            今日共 {stats.todayIn + stats.todayOut} 笔
          </span>,
        ]}
      />

      {/* ===== 详情抽屉 ===== */}
      <Drawer
        width={720}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={`出入库单 ${detail?.inoutNo ?? ''}`}
      >
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="出入库编号">
            {detail?.inoutNo}
          </Descriptions.Item>
          <Descriptions.Item label="HIS编号">
            {detail?.hisInoutNo ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="方向">
            {detail?.ioDirection === '1' ? '入库' : '出库'}
          </Descriptions.Item>
          <Descriptions.Item label="操作人">
            {detail?.operatorName}
          </Descriptions.Item>
          <Descriptions.Item label="验收人">
            {detail?.checkName ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {detail?.createTime}
          </Descriptions.Item>
        </Descriptions>
        <Table
          style={{ marginTop: 16 }}
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={detail?.details ?? []}
          columns={[
            { title: '药品编码', dataIndex: 'drugCode' },
            { title: '药品名称', dataIndex: 'drugName' },
            { title: '数量', dataIndex: 'count', width: 60 },
            { title: '单位', dataIndex: 'ioUnit', width: 60 },
            { title: '零售价', dataIndex: 'retailPrice', width: 80 },
            { title: '批次号', dataIndex: 'batchNumber' },
            { title: '厂家', dataIndex: 'phamFactoryName', ellipsis: true },
          ]}
        />
      </Drawer>

      {/* ===== 新建弹窗 ===== */}
      <ModalForm
        title="新建出入库单"
        width={720}
        open={createOpen}
        onOpenChange={setCreateOpen}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (values) => {
          await createDrugTransfer(values);
          message.success('创建成功');
          actionRef.current?.reload();
          loadStats();
          return true;
        }}
      >
        <ProFormDigit
          name="miId"
          label="机构ID"
          rules={[{ required: true, message: '请输入机构ID' }]}
        />
        <ProFormSelect
          name="ioDirection"
          label="出入库方向"
          rules={[{ required: true, message: '请选择出入库方向' }]}
          options={[
            { label: '入库', value: '1' },
            { label: '出库', value: '0' },
          ]}
        />
        <ProFormText
          name="inoutNo"
          label="出入库编号"
          placeholder="留空则自动生成"
        />
        <ProFormText name="operatorName" label="操作人姓名" />
        <ProFormText name="inPharmacyCode" label="收货库房编码" />
        <ProFormText name="outPharmacyCode" label="发货库房编码" />
        <ProFormList
          name="items"
          label="药品明细"
          creatorButtonProps={{ creatorButtonText: '添加一行药品' }}
        >
          <ProFormText name="drugCode" label="药品编码" width="sm" />
          <ProFormText name="drugName" label="药品名称" width="md" />
          <ProFormDigit name="count" label="数量" width="xs" />
          <ProFormText name="ioUnit" label="单位" width="xs" />
          <ProFormText name="batchNumber" label="批次号" width="sm" />
          <ProFormDigit name="retailPrice" label="零售价" width="xs" />
        </ProFormList>
      </ModalForm>
    </PageContainer>
  );
};

export default DrugTransferList;
