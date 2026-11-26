/**
 * 字典类型 新增/编辑弹窗（契约校准版）
 * 红线（《关键点.md》§6.1/§6.2/坑#1/坑#6）：
 * - dictCode：必填 + /^[a-z][a-z0-9_]*$/ + 禁保留词 page/options（坑#1：字面命中管理路由被遮蔽）；
 *   编辑态后端锁定 → disabled
 * - type 分组：1国标/2院内/3平台/4行标；type=2（院内）→ 必选所属机构 miId（服务层
 *   getMiIdRequired fail-fast 兜底）；type≠2 → 后端强制归 -1，前端隐藏机构项并提示
 *   「将发布为平台级数据」（§6.1：前端禁用输入 = 不提供输入项，语义等价）
 * - dictType（实体/映射）：§6.2「新增默认 '0'，一般不暴露给用户改」→ 表单不渲染该字段：
 *   新增由 services 兜底 '0'，编辑不传 → 后端保留原值（坑#6 语义）
 * - status 不进表单（后端锁定，独立启停端点）→ 状态变更走列表行内 Switch
 * - 4602 → dictCode 内联标红「编码已存在」；4601/400/500 → message.error(后端原文)
 * ⚠️ 机构选择器数据源：暂以当前登录机构（useOrgId）为唯一选项；若有机构列表服务请替换 options
 */
import { Alert, App, Form, Input, Select } from 'antd';
import { useEffect, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import { useMiNames } from '@/hooks/useMi';
import {
  createDictType,
  DICT_ERR,
  type DictTypeVO,
  getBizCode,
  updateDictType,
} from '@/services/dict';
import { useOrgId } from '@/utils/orgContext';
import { DICT_CODE_PATTERN, DICT_CODE_RESERVED, SCOPE_META } from './constants';

interface Props {
  open: boolean;
  editing: DictTypeVO | null; // null = 新增
  onClose: () => void;
  /** 保存成功回调（新增回传新 id） */
  onSaved: (newId?: number) => void;
}

export default function TypeModal({ open, editing, onClose, onSaved }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  /** 当前机构 miId（type=2 机构选择器唯一选项） */
  const orgId = useOrgId();
  const nameOf = useMiNames();
  /** type 联动：=2 显示机构必选，≠2 显示平台级提示 */
  const typeValue = Form.useWatch('type', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      editing
        ? {
            dictCode: editing.dictCode,
            dictName: editing.dictName,
            type: editing.type,
            remark: editing.remark ?? undefined,
          }
        : {}, // dictType 不进表单：新增由 services 兜底 '0'（§6.2）
    );
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // 选「院内」→ 自动填入当前机构（服务层 getMiIdRequired 兜底 fail-fast）
  useEffect(() => {
    if (editing) return;
    if (typeValue === '2' && orgId != null && Number(orgId) > 0) {
      form.setFieldsValue({ miId: String(Number(orgId)) });
    }
  }, [typeValue, editing, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        // PUT 仅提交可改字段；dictCode/miId/status 后端锁定（坑#6，传了也被忽略）；
        // dictType 不传 → 后端保留原值
        await updateDictType({
          id: editing.id,
          dictName: v.dictName,
          type: v.type,
          remark: v.remark,
        });
        onSaved();
      } else {
        const res = await createDictType({
          dictCode: v.dictCode,
          dictName: v.dictName,
          type: v.type,
          miId: v.type === '2' && v.miId != null ? Number(v.miId) : undefined,
          remark: v.remark,
        });
        onSaved(res?.id);
      }
      message.success(editing ? '修改成功' : '创建成功');
    } catch (e) {
      // §6.6：4602 → dictCode 内联标红；其余（4601/400/500）→ 后端原文 toast
      if (getBizCode(e) === DICT_ERR.TYPE_CODE_DUP) {
        form.setFields([{ name: 'dictCode', errors: ['编码已存在'] }]);
      } else {
        message.error((e as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <DraggableModal
      title={editing ? '编辑字典类型' : '新增字典类型'}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnClose
      width={480}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item
          name="dictCode"
          label="字典代码"
          extra="建议大写字母加数字编号"
          rules={[
            { required: true, message: '请输入字典代码' },
            {
              pattern: DICT_CODE_PATTERN,
              message: '小写字母开头，仅含小写字母/数字/下划线',
            },
            {
              validator: (_: unknown, value?: string) =>
                value && DICT_CODE_RESERVED.includes(value)
                  ? Promise.reject(
                      new Error(`「${value}」为系统保留字，请更换其他编码`),
                    )
                  : Promise.resolve(),
            },
          ]}
        >
          {/* 坑#6：编辑态 dictCode 后端锁定 → disabled */}
          <Input disabled={!!editing} placeholder="如 PTS0001" maxLength={50} />
        </Form.Item>

        <Form.Item
          name="dictName"
          label="字典名称"
          rules={[{ required: true, message: '请输入字典名称' }]}
        >
          <Input placeholder="如 药品出库类型" maxLength={50} />
        </Form.Item>

        <Form.Item
          name="type"
          label="所属分组"
          rules={[{ required: true, message: '请选择所属分组' }]}
        >
          {/* 1国标/2院内/3平台/4行标；修改可改（§6.1 DTO） */}
          <Select
            placeholder="请选择所属分组"
            options={SCOPE_META.map((s) => ({
              value: s.value,
              label: s.label,
            }))}
          />
        </Form.Item>

        {/* 规则：type=2（院内）→ 必选所属机构（type≠2 后端强制 -1，不提供输入 = §6.1"禁用输入"） */}
        {!editing && typeValue === '2' && (
          <Form.Item
            name="miId"
            label="所属机构"
            rules={[{ required: true, message: '请选择所属机构' }]}
          >
            <Select
              placeholder="请选择所属机构"
              options={
                orgId != null && Number(orgId) > 0
                  ? [{ value: String(Number(orgId)), label: nameOf(orgId) }]
                  : []
              }
            />
          </Form.Item>
        )}

        {/* type≠2 → 平台级发布提示（后端强制落 miId=-1，前端不携带；仅新增态展示） */}
        {!editing && typeValue != null && typeValue !== '2' && (
          <Alert
            type="info"
            showIcon
            message="将发布为平台级数据"
            style={{ marginBottom: 16 }}
          />
        )}

        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} placeholder="选填" />
        </Form.Item>
      </Form>
    </DraggableModal>
  );
}
