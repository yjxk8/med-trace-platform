/**
 * 字典项 新增/编辑弹窗（紧凑版）
 * 排版（业务确认）：
 * - 去掉「高级选项」Collapse：排序 / 拼音首字母 平铺，与 值域代码/值域名称 各成双列一行
 * - 宽度 520→440，行距压缩，弹窗高度显著降低
 * 拼音契约（不变，《前端拼音自动生成对接.md》）：
 * - 编辑打开回显 DB 当前值；仅用户真正改过输入框才随提交携带；
 *   未触碰不携带 → 后端按 label 自动生成/重算/保持原值
 * - 改「值域名称」且未手动接管拼音 → 输入框自动清空（placeholder 提示留空自动生成）
 * - 写成功后 invalidate 业务侧下拉缓存（useDict）
 */
import { App, Col, Form, Input, InputNumber, Row, Switch } from 'antd';
import { useEffect, useRef, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import { useDict } from '@/hooks/useDict';
import {
  createDictData,
  type DictDataVO,
  setDictDataStatus,
  updateDictData,
} from '@/services/dict';
import { isOn } from './shared';

interface Props {
  open: boolean;
  editing: DictDataVO | null; // null = 新增
  dictCode: string;
  dictTypeName?: string;
  onClose: () => void;
  onSaved: () => void;
}

/** 紧凑行距：覆盖 Form.Item 默认 marginBottom(24) */
const itemMb = { marginBottom: 14 } as const;

export default function DataModal({
  open,
  editing,
  dictCode,
  dictTypeName,
  onClose,
  onSaved,
}: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [statusOn, setStatusOn] = useState(true);
  const { invalidate } = useDict();

  /** 用户是否手动改过拼音输入框：改过才随提交携带（契约：视为手工指定） */
  const pinyinTouched = useRef(false);

  useEffect(() => {
    if (!open) return;
    pinyinTouched.current = false; // 每次打开重置：回显值不视为「手工指定」
    form.resetFields();
    form.setFieldsValue(
      editing
        ? {
            dictLabel: editing.dictLabel,
            dictValue: editing.dictValue,
            dictSort: editing.dictSort ?? undefined,
            pinyin: String(editing.pinyin ?? ''), // 业务确认：当前值回显进输入框
          }
        : { pinyin: '' },
    );
    setStatusOn(editing ? isOn(editing.status) : true);
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      // 契约核心：仅手改过的拼音才提交；未触碰一律不携带（后端自动生成/重算/保持）
      const py = pinyinTouched.current ? String(v.pinyin ?? '').trim() : '';
      const pyField = py ? { pinyin: py } : {};
      if (editing) {
        await updateDictData({
          id: editing.id,
          dictLabel: v.dictLabel,
          dictValue: v.dictValue,
          dictSort: v.dictSort,
          ...pyField,
        });
        const next = statusOn ? 0 : 1;
        if (next !== (isOn(editing.status) ? 0 : 1)) {
          await setDictDataStatus(editing.id, next as 0 | 1);
        }
      } else {
        await createDictData({
          dictCode,
          dictLabel: v.dictLabel,
          dictValue: v.dictValue,
          dictSort: v.dictSort,
          ...pyField,
        });
      }
      message.success(editing ? '修改成功' : '创建成功');
      invalidate(dictCode);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <DraggableModal
      title={editing ? '编辑字典项' : '新增字典项'}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnClose
      width={440}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item label="所属类型" style={itemMb}>
          <Input value={dictCode} disabled title={dictTypeName} />
        </Form.Item>

        {/* 值域代码 / 值域名称 双列一行 */}
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item
              name="dictValue"
              label="值域代码"
              rules={[{ required: true, message: '请输入' }]}
              style={itemMb}
            >
              <Input placeholder="如 01" />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item
              name="dictLabel"
              label="值域名称"
              rules={[{ required: true, message: '请输入值域名称' }]}
              style={itemMb}
            >
              <Input
                placeholder="如 针剂"
                onChange={() => {
                  // 改名称且未手动接管拼音 → 清空（提交不携带 → 后端按新名称重算）；
                  // 打开时的程序性回显不触发本 onChange
                  if (!pinyinTouched.current) form.setFieldValue('pinyin', '');
                }}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* 排序 / 拼音首字母 双列一行（原「高级选项」折叠已删除，字段平铺） */}
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="dictSort" label="排序" style={itemMb}>
              <InputNumber
                min={0}
                style={{ width: '100%' }}
                placeholder="选填"
              />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item name="pinyin" label="拼音首字母" style={itemMb}>
              <Input
                placeholder="留空自动生成"
                maxLength={50}
                allowClear
                onChange={() => {
                  // 用户手动输入/清空 → 人工接管：此后随提交携带（含清空=交给后端）
                  pinyinTouched.current = true;
                }}
              />
            </Form.Item>
          </Col>
        </Row>

        {editing && (
          <Form.Item label="状态" style={{ marginBottom: 0 }}>
            <Switch
              checked={statusOn}
              checkedChildren="启用"
              unCheckedChildren="停用"
              onChange={setStatusOn}
            />
            <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>
              已被历史数据引用的值建议「停用」而非删除
            </span>
          </Form.Item>
        )}
      </Form>
    </DraggableModal>
  );
}
