/**
 * 机构参数配置（列表页）—— 契约：机构参数配置 v1 §三/§六
 * PageFill 骨架 + FillTable(ProTable request 模式)；IPage 分页（page/size），
 * 后端固定排序 miId→configType→configName 升序，前端无需再排
 * - 筛选：miId / configType（精确）/ configName（模糊）
 * - 空名键渲染「（类型默认）」（§6.4），不留白
 * - 删除确认对齐复活语义（§6.1）：不写「彻底删除/不可恢复」，说明同键重建将恢复原行
 * - 不缓存行 id（§6.1）：列表即时展示，操作后 reload
 * ⚠️ FillTable 非泛型：回调参数显式注解（TS7006）
 */
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
  App,
  Button,
  Input,
  InputNumber,
  Modal,
  Space,
  Tooltip,
  Typography,
} from 'antd';
import { useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import {
  deleteMiConfig,
  getMiConfigPage,
  type MiConfigVO,
} from '@/services/org/miConfig';
import MiConfigFormModal from './MiConfigFormModal';
import { fmtFull, keyLabel, renderKeyName } from './shared';

export default function MiConfigManage() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const [miId, setMiId] = useState<number | undefined>(undefined);
  const [configType, setConfigType] = useState('');
  const [configName, setConfigName] = useState('');
  const filterRef = useRef<{
    miId?: number;
    configType?: string;
    configName?: string;
  }>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MiConfigVO | null>(null);

  const doSearch = () => {
    filterRef.current = {
      miId,
      configType: configType.trim() || undefined,
      configName: configName.trim() || undefined,
    };
    actionRef.current?.reloadAndRest?.();
  };
  const doReset = () => {
    setMiId(undefined);
    setConfigType('');
    setConfigName('');
    filterRef.current = {};
    actionRef.current?.reloadAndRest?.();
  };

  /** §6.1 复活语义：软删行仍占唯一键，同键重建复活原行——文案不写「彻底删除/不可恢复」 */
  const removeConfig = (r: MiConfigVO) => {
    Modal.confirm({
      title: `删除配置「${keyLabel(r)}」？`,
      content:
        '删除后该配置项立即不再生效；后续以相同机构 / 类型 / 名称新建时，将恢复本条记录并保留原创建时间。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await deleteMiConfig(r.id);
          message.success(res?.message || '删除成功');
          actionRef.current?.reload();
        } catch (e) {
          message.error((e as Error).message);
          throw e; // 保持弹窗打开
        }
      },
    });
  };

  const columns: ProColumns<MiConfigVO>[] = [
    {
      title: '机构ID',
      dataIndex: 'miId',
      width: 90,
      align: 'center',
      render: (_, r) => r.miId ?? '-', // 【§八#1】org 模块就绪后换机构名称
    },
    {
      title: '配置类型',
      dataIndex: 'configType',
      width: 140,
      ellipsis: true,
      render: (_, r) => r.configType || 'default',
    },
    {
      title: '参数名称',
      dataIndex: 'configName',
      width: 170,
      ellipsis: true,
      render: (_, r) => renderKeyName(r.configName), // §6.4 空名键占位
    },
    {
      title: '参数值',
      dataIndex: 'configValue',
      ellipsis: true,
      render: (_, r) =>
        r.configValue ? (
          r.configValue
        ) : (
          <Typography.Text type="secondary">（空）</Typography.Text>
        ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 180,
      ellipsis: true,
      render: (_, r) => r.remark || '-',
    },
    {
      title: '更新时间',
      dataIndex: 'updateTime',
      width: 170,
      align: 'center',
      render: (_, r) => fmtFull(r.updateTime),
    },
    {
      title: '操作',
      valueType: 'option',
      fixed: 'right',
      width: 100,
      align: 'center',
      // ⚠️ 第一参是 dom，必须占位 _（历史坑）
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              style={{ padding: '0 4px' }}
              icon={<EditOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />}
              onClick={() => {
                setEditing(r);
                setFormOpen(true);
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
              onClick={() => removeConfig(r)}
            />
          </Tooltip>
        </Space>
      ),
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
          padding: '12px 16px 4px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 筛选区：miId / configType（精确）/ configName（模糊） */}
        <div
          style={{ display: 'flex', gap: 8, marginBottom: 12, flexShrink: 0 }}
        >
          <InputNumber
            min={1}
            style={{ width: 130 }}
            placeholder="机构ID"
            value={miId}
            onChange={(v) => setMiId(v ?? undefined)}
            onPressEnter={doSearch}
          />
          <Input
            allowClear
            style={{ width: 170 }}
            placeholder="配置类型（精确）"
            value={configType}
            onChange={(e) => setConfigType(e.target.value)}
            onPressEnter={doSearch}
          />
          <Input
            allowClear
            style={{ width: 180 }}
            placeholder="参数名称（模糊）"
            value={configName}
            onChange={(e) => setConfigName(e.target.value)}
            onPressEnter={doSearch}
          />
          <Button type="primary" onClick={doSearch}>
            查询
          </Button>
          <Button onClick={doReset}>重置</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            新增配置
          </Button>
        </div>

        <FillTable
          pro
          reservedHeight={160}
          headerTitle="机构参数配置"
          rowKey={(r: MiConfigVO) => String(r.id)}
          actionRef={actionRef}
          columns={columns}
          search={false}
          options={{ reload: true, density: false, setting: false }}
          cardBordered={false}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t: number) => `共 ${t} 条`,
          }}
          request={async (params: { current?: number; pageSize?: number }) => {
            try {
              const res = await getMiConfigPage({
                page: params.current ?? 1,
                size: params.pageSize ?? 10,
                ...filterRef.current,
              });
              return { data: res.records, total: res.total, success: true };
            } catch (e) {
              message.error((e as Error).message); // 500 原文 toast；401 由拦截器跳登录
              return { data: [], total: 0, success: false };
            }
          }}
        />
      </div>

      <MiConfigFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          actionRef.current?.reload();
        }}
      />
    </PageFill>
  );
}
