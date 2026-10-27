/**
 * 字典管理（左树右表单页）—— 样式/范式对齐「药品库存」页：
 * PageFill 骨架 + 白卡 + FillTable(ProTable request 模式) + App.useApp message
 *
 * 红线：
 * - miId 为后端强校验字段（DictServiceImpl.typePage 实测 500）→ 页面级 fail-fast，
 *   缺失时渲染阻断 Alert（含重试），不发无效请求、不刷 500
 * - 值域代码(dictValue)/code(dictLabel) 字符串原样，禁止数值化
 * - 类型树一次全量（size=999，【待确认】后端上限）；切换类型 → reloadAndRest 回第 1 页
 * - 删除为物理删除；弹窗文案引导历史引用场景改「停用」
 *
 * ⚠️ FillTable 非泛型：rowKey/onRow/request/showTotal 回调参数必须显式注解（TS7006）
 */

import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
  Alert,
  App,
  Button,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
} from 'antd'; // 补 Tooltip
import { useEffect, useRef, useState } from 'react';
import FillTable from '@/components/FillTable';
import PageFill from '@/components/PageFill';
import { useDict } from '@/hooks/useDict';
import {
  type DictDataVO,
  type DictTypeVO,
  deleteDictData,
  deleteDictType,
  getMiId,
  pageDictData,
  pageDictType,
  setDictDataStatus,
} from '@/services/dict';
import DataModal from './DataModal';
import { fmtFull, isOn } from './shared';
import TypeModal from './TypeModal';
import TypeTree from './TypeTree';

export default function DictManage() {
  const { message } = App.useApp();
  const { invalidate } = useDict();

  /** miId fail-fast：后端强校验，缺失直接阻断页面（登录态/机构切换后可重试） */
  const [miId, setMiId] = useState<number | undefined>(() => getMiId());

  const [types, setTypes] = useState<DictTypeVO[]>([]);
  const [typeLoading, setTypeLoading] = useState(false);
  const [selected, setSelected] = useState<DictTypeVO | null>(null);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<DictTypeVO | null>(null);

  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<DictDataVO | null>(null);

  const actionRef = useRef<ActionType | undefined>(undefined);
  /** 选中类型快照：FillTable request 闭包读取，切换时 reloadAndRest（对齐 filterRef 范式） */
  const typeRef = useRef<DictTypeVO | null>(null);

  // ===== 类型树全量加载（size=999【待确认】后端分页上限） =====
  const loadTypes = async (selectId?: number) => {
    setTypeLoading(true);
    try {
      const res = await pageDictType({ page: 1, size: 999 });
      const list = res.records ?? [];
      setTypes(list);
      setSelected((prev) => {
        if (selectId) return list.find((t) => t.id === selectId) ?? prev; // 新增后自动选中
        return prev
          ? (list.find((t) => t.id === prev.id) ?? null)
          : (list[0] ?? null);
      });
    } catch (e) {
      message.error((e as Error).message); // 500 原文 toast（含 miId 缺失等业务文案）
    } finally {
      setTypeLoading(false);
    }
  };

  useEffect(() => {
    if (miId) loadTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miId]);

  // 切换类型 → 快照更新 + 表格回第 1 页重查
  useEffect(() => {
    typeRef.current = selected;
    actionRef.current?.reloadAndRest?.();
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 类型操作 =====
  const removeType = (row: DictTypeVO) => {
    Modal.confirm({
      title: `删除字典类型「${row.dictName}」？`,
      content:
        '删除后不可恢复；若该类型下已存在字典项，后端将拒绝删除（需先清空字典项）。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteDictType(row.id);
        message.success('删除成功');
        if (selected?.id === row.id) setSelected(null);
        loadTypes();
      },
    });
  };

  // ===== 字典项删除（物理删除；onConfirm 内闭包拿最新选中类型） =====
  const removeData = async (row: DictDataVO) => {
    const t = typeRef.current;
    await deleteDictData(row.id);
    message.success('删除成功');
    if (t) invalidate(t.dictCode); // 失效业务侧下拉缓存
    actionRef.current?.reload();
  };
  /** 启停字典项：'0' 启用 ↔ '1' 停用；成功后失效下拉缓存并刷新当前页 */
  const toggleData = async (row: DictDataVO) => {
    const t = typeRef.current;
    const next = isOn(row.status) ? 1 : 0;
    await setDictDataStatus(row.id, next as 0 | 1);
    message.success(next === 1 ? '已停用' : '已启用');
    if (t) invalidate(t.dictCode);
    actionRef.current?.reload();
  };
  // ===== 列定义（对齐真实系统 4 列；数组显式泛型，render 拿到上下文类型） =====
  const columns: ProColumns<DictDataVO>[] = [
    {
      title: '值域代码',
      dataIndex: 'dictValue',
      width: 180,
      align: 'center',
      render: (_, r) => r.dictValue ?? '-',
    },
    {
      title: '值域名称',
      dataIndex: 'dictLabel',
      align: 'center',
      render: (_, r) => (
        <Space>
          {r.dictLabel ?? '-'}
          {!isOn(r.status) && <Tag>停用</Tag>}
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 190,
      align: 'center',
      render: (_, r) => fmtFull(r.createTime), // 带 T / 不带 T 双形态兼容
    },
    {
      title: '操作',
      valueType: 'option',
      fixed: 'right',
      width: 110,
      align: 'center',
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
          <Tooltip title={isOn(r.status) ? '停用' : '启用'}>
            <Button
              type="text"
              size="small"
              style={{ padding: '0 4px' }}
              icon={
                isOn(r.status) ? (
                  <StopOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
                ) : (
                  <CheckCircleOutlined
                    style={{ color: '#52c41a', fontSize: 14 }}
                  />
                )
              }
              onClick={() => toggleData(r)}
            />
          </Tooltip>
          <Popconfirm
            title="确定删除该字典项？"
            description="物理删除且不可恢复；若已被历史数据引用，请改为「停用」。"
            okText="删除"
            okButtonProps={{ danger: true }}
            onConfirm={() => removeData(r)}
          >
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                style={{ padding: '0 4px' }}
                icon={<DeleteOutlined style={{ fontSize: 14 }} />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ===== miId 阻断态（对齐 StatsCards 错误 Alert 模式） =====
  if (!miId) {
    return (
      <PageFill>
        <Alert
          type="warning"
          showIcon
          message="未获取到机构ID（miId）"
          description={
            '字典接口为后端强校验字段，缺失会导致所有请求 500。' +
            '请确认登录态已携带机构信息；若已切换机构，点击重试。' +
            '（修复来源：services/dict.ts → getMiId，与 drugStock 服务取值方式对齐）'
          }
          action={
            <Button size="small" onClick={() => setMiId(getMiId())}>
              重试
            </Button>
          }
        />
      </PageFill>
    );
  }

  return (
    <PageFill>
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        {/* ===== 左：字典类型树（白卡，样式 token 对齐药品库存筛选栏） ===== */}
        <TypeTree
          types={types}
          loading={typeLoading}
          selected={selected}
          onSelect={setSelected}
          onAdd={() => {
            setEditingType(null);
            setTypeModalOpen(true);
          }}
          onEdit={(t) => {
            setEditingType(t);
            setTypeModalOpen(true);
          }}
          onDelete={removeType}
        />

        {/* ===== 右：字典项表格（白卡占满剩余高度，表体内部滚动） ===== */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: '#fff',
            borderRadius: 8,
            padding: '12px 16px 4px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ marginBottom: 12, flexShrink: 0 }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!selected}
              onClick={() => {
                setEditingData(null);
                setDataModalOpen(true);
              }}
            >
              新增
            </Button>
            {selected && (
              <span style={{ marginLeft: 12, color: '#8c8c8c' }}>
                {selected.dictName}（{selected.dictCode}）
              </span>
            )}
          </div>

          <FillTable
            pro
            reservedHeight={160} // 底部被裁/留白过大时微调此值
            headerTitle="字典项"
            // ⚠️ FillTable 无泛型，回调参数显式注解（TS7006）
            rowKey={(r: DictDataVO) => String(r.id)}
            actionRef={actionRef}
            columns={columns}
            search={false}
            options={{ reload: true, density: false, setting: false }}
            cardBordered={false}
            request={async (params: {
              current?: number;
              pageSize?: number;
            }) => {
              const t = typeRef.current;
              if (!t) return { data: [], total: 0, success: true };
              try {
                const res = await pageDictData({
                  dictCode: t.dictCode,
                  page: params.current ?? 1,
                  size: params.pageSize ?? 10,
                });
                return { data: res.records, total: res.total, success: true };
              } catch (e) {
                message.error((e as Error).message); // 500 → toast 原文；401 由拦截器跳登录
                return { data: [], total: 0, success: false };
              }
            }}
            pagination={{
              defaultPageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (t: number) => `共 ${t} 条`,
            }}
          />
        </div>
      </div>

      {/* ===== 弹窗 ===== */}
      <TypeModal
        open={typeModalOpen}
        editing={editingType}
        onClose={() => setTypeModalOpen(false)}
        onSaved={(newId) => {
          setTypeModalOpen(false);
          loadTypes(newId);
        }}
      />
      <DataModal
        open={dataModalOpen}
        editing={editingData}
        dictCode={selected?.dictCode ?? ''}
        dictTypeName={selected?.dictName}
        onClose={() => setDataModalOpen(false)}
        onSaved={() => {
          setDataModalOpen(false);
          actionRef.current?.reload();
        }}
      />
    </PageFill>
  );
}
