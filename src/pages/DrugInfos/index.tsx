import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { App, Button, Form, Input, Popconfirm } from 'antd';
import { useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import type { DrugInfosItem } from '@/services/drugInfos';
import {
  pageDrugInfos,
  setDrugUseStatus,
  voidDrug,
} from '@/services/drugInfos';
import SaveForm from './SaveForm';

const MI_ID = 12; // TODO: 接入租户上下文后替换

const DrugInfosPage: React.FC = () => {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>();
  const [filterForm] = Form.useForm();
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const search = () => {
    setFilters(filterForm.getFieldsValue());
  };

  const handleUseStatus = async (row: DrugInfosItem, status: 0 | 1) => {
    try {
      await setDrugUseStatus(row.id, status);
      message.success(status === 1 ? '已启用' : '已停用（选药下拉中不再出现）');
      actionRef.current?.reload();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  };

  const handleVoid = async (row: DrugInfosItem) => {
    try {
      await voidDrug(row.id);
      message.success('已作废');
      actionRef.current?.reload();
    } catch (e: any) {
      message.error(e?.message || '作废失败');
    }
  };

  const columns: ProColumns<DrugInfosItem>[] = [
    { title: '药品编码', dataIndex: 'phamStdCode', width: 140, copyable: true },
    { title: '药品名称', dataIndex: 'phamName', width: 200, ellipsis: true },
    { title: '规格', dataIndex: 'phamSpec', width: 120, ellipsis: true },
    { title: '剂型', dataIndex: 'dosageForm', width: 100 },
    { title: '单位', dataIndex: 'phamUnit', width: 70 },
    { title: '价格', dataIndex: 'retailPrice', width: 70 },
    {
      title: '状态',
      dataIndex: 'drugUseStatus',
      width: 80,
      valueType: 'select',
      fieldProps: {
        options: [
          { value: 1, label: '在用' },
          { value: 0, label: '停用' },
        ],
      },
      renderText: (v) => (v === 1 ? '在用' : '停用'),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 160,
      fixed: 'right',
      render: (_, record) => [
        <a
          key="edit"
          onClick={() => {
            setEditingId(record.id);
            setFormOpen(true);
          }}
        >
          编辑
        </a>,
        record.drugUseStatus === 1 ? (
          <Popconfirm
            key="stop"
            title="停用后选药下拉中将不再出现该药品，确认停用？"
            onConfirm={() => handleUseStatus(record, 0)}
          >
            <a>停用</a>
          </Popconfirm>
        ) : (
          <a key="start" onClick={() => handleUseStatus(record, 1)}>
            启用
          </a>
        ),
        <Popconfirm
          key="void"
          title="作废后列表不再显示（软删，详情仍可见），确认作废？"
          onConfirm={() => handleVoid(record)}
        >
          <a style={{ color: '#ff4d4f' }}>作废</a>
        </Popconfirm>,
      ],
    },
  ];

  return (
    <PageFill>
      {/* ===== 筛选栏卡片：仅编码 + 药品名称 ===== */}
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: '10px 16px',
          flexShrink: 0,
        }}
      >
        <Form form={filterForm} layout="inline" onFinish={search}>
          <Form.Item name="phamStdCode">
            <Input
              placeholder="药品编码"
              allowClear
              style={{ width: 220 }}
              onPressEnter={search}
            />
          </Form.Item>
          <Form.Item name="keyword">
            <Input
              placeholder="药品名称"
              allowClear
              style={{ width: 220 }}
              onPressEnter={search}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">
              查询
            </Button>
          </Form.Item>
          <Form.Item>
            <Button
              onClick={() => {
                filterForm.resetFields();
                setFilters({});
              }}
            >
              重置
            </Button>
          </Form.Item>
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
          reservedHeight={76}
          headerTitle="药品字典"
          rowKey="id"
          actionRef={actionRef}
          columns={columns}
          search={false} // 内置查询关闭，用上面的自定义筛选栏
          scroll={{ x: 1200 }}
          params={filters} // filters 变化自动触发重新请求
          options={false}
          cardBordered={false}
          request={async (p) => {
            try {
              const { current, pageSize, ...rest } = p; // rest = phamStdCode/keyword（来自 params）
              const res = await pageDrugInfos({
                page: current ?? 1,
                size: pageSize ?? 10,
                miId: MI_ID,
                ...rest,
              });
              return { data: res.records, total: res.total, success: true };
            } catch (e: any) {
              message.error(e?.message || '加载失败');
              return { data: [], total: 0, success: false };
            }
          }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
          }}
        />
      </div>

      {/* ===== 编辑弹窗（无新增入口，编辑从行操作进入） ===== */}
      <SaveForm
        open={formOpen}
        editingId={editingId}
        miId={MI_ID}
        onClose={() => setFormOpen(false)}
        onSuccess={() => {
          setFormOpen(false);
          actionRef.current?.reload();
        }}
      />
    </PageFill>
  );
};

export default DrugInfosPage;
