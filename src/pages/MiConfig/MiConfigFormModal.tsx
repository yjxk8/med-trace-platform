/**
 * 机构参数配置 新增/编辑弹窗 —— 契约：机构参数配置 v1 §四/§五/§六
 * - 编辑：键字段（miId/configType/configName）纯文本只读（§6.2），仅值/备注可编辑；
 *   行数据即完整 VO（page/detail 出参同构、无树形截断），直接回显无需再调 detail
 * - 新增：miId 默认当前机构【§八#1 机构数据源就绪后换 OrgSelect】；configType 默认 default；
 *   configName 留空=类型级默认配置（§6.4）
 * - 提交前查重（§6.5）：miId+configType 精确拉回（page 的 configName 是模糊，不能直接查重），
 *   再精确比对 configName，拦下后端「该配置项已存在：default / 」原始尾巴文案
 * - configValue：TextArea + showCount（≤2000）；编辑态清空后保存=清空（""，§6.3，services 豁免）
 *   按类型 JSON 前置校验待 §八#5 结构规范后接入
 */
import { App, Col, Form, Input, InputNumber, Row } from 'antd';
import { useEffect, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import {
  createMiConfig,
  getMiConfigPage,
  type MiConfigVO,
  updateMiConfig,
} from '@/services/org/miConfig';
import { getMiId } from '@/services/tenant';
import { renderKeyName } from './shared';

interface Props {
  open: boolean;
  editing: MiConfigVO | null; // null = 新增
  onClose: () => void;
  onSaved: () => void;
}

const itemMb = { marginBottom: 12 } as const;
const C2 = { span: 12 } as const;

export default function MiConfigFormModal({
  open,
  editing,
  onClose,
  onSaved,
}: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing?.id;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (isEdit && editing) {
      form.setFieldsValue({
        configValue: editing.configValue ?? '',
        remark: editing.remark ?? '',
      });
    } else {
      // §四 create 默认：configType=default；configName 留空=类型级默认；configValue 留空=''
      form.setFieldsValue({
        miId: getMiId(),
        configType: 'default',
        configName: '',
      });
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      if (isEdit && editing) {
        // §6.2：仅 configValue/remark 生效（键字段后端忽略，前端不传更干净）
        // configValue：有值原样、清空传 ""（=清空 §6.3，services 豁免不剔除）
        const res = await updateMiConfig({
          id: editing.id,
          configValue: v.configValue ?? '',
          remark: v.remark?.trim() || undefined, // remark 空串=不改（§二 通用空串转 null）
        });
        message.success(res?.message || '修改成功');
      } else {
        // §6.5 提交前查重：miId+configType（缺省 default）精确拉回，再精确比对 configName
        // （page 的 configName 是模糊匹配，query 直接传不可靠；单组合配置项不会超 100 条）
        const type = (v.configType ?? '').trim() || 'default';
        const name = (v.configName ?? '').trim();
        const page = await getMiConfigPage({
          miId: v.miId,
          configType: type,
          size: 100,
        });
        if (page.records.some((r) => (r.configName ?? '') === name)) {
          message.error(`该配置项已存在：${type} / ${name || '（类型默认）'}`);
          return;
        }
        const res = await createMiConfig({
          miId: v.miId,
          configType: v.configType, // 留空 → 后端规范 default
          configName: v.configName, // 留空 = 类型级默认配置（§6.4）
          configValue: v.configValue ?? '', // §四 缺省 ''
          remark: v.remark,
        });
        message.success(res?.message || '创建成功');
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <DraggableModal
      title={isEdit ? '编辑配置' : '新增配置'}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnClose
      width={640}
      centered
    >
      <Form form={form} layout="vertical">
        <Row gutter={12}>
          <Col {...C2}>
            {isEdit ? (
              <Form.Item label="所属机构" style={itemMb}>
                <span>{editing?.miId}</span>{' '}
                {/* §6.2 锁定；【§八#1】org 就绪后显示机构名 */}
              </Form.Item>
            ) : (
              <Form.Item
                name="miId"
                label="所属机构"
                rules={[{ required: true, message: '所属机构不能为空' }]}
                style={itemMb}
                extra={
                  <span style={{ fontSize: 12 }}>
                    默认当前机构；跨机构同键互相隔离【§八#1 待 OrgSelect】
                  </span>
                }
              >
                <InputNumber
                  min={1}
                  style={{ width: '100%' }}
                  placeholder="机构 ID"
                />
              </Form.Item>
            )}
          </Col>
          <Col {...C2}>
            {isEdit ? (
              <Form.Item label="配置类型" style={itemMb}>
                <span>{editing?.configType || 'default'}</span>
              </Form.Item>
            ) : (
              <Form.Item
                name="configType"
                label="配置类型"
                style={itemMb}
                extra={
                  <span style={{ fontSize: 12 }}>
                    命名空间；留空存为 default
                  </span>
                }
              >
                <Input placeholder="如 print" maxLength={50} />
              </Form.Item>
            )}
          </Col>
        </Row>
        <Form.Item label="参数名称" style={itemMb}>
          {isEdit ? (
            renderKeyName(editing?.configName) // §6.2 锁定；空名键展示「（类型默认）」
          ) : (
            <Form.Item name="configName" noStyle>
              <Input
                placeholder="留空 = 类型级默认配置（该类型下未具名参数的兜底值）"
                maxLength={100}
              />
            </Form.Item>
          )}
        </Form.Item>

        <Form.Item
          name="configValue"
          label="参数值"
          style={itemMb}
          extra={
            <span style={{ fontSize: 12 }}>
              通用载荷，常存 JSON 文本（≤2000 字符，格式由消费方定义【§八#5】）
              {isEdit && '；清空此处并保存 = 清空该值'}
            </span>
          }
        >
          <Input.TextArea
            rows={4}
            maxLength={2000}
            showCount
            placeholder={isEdit ? undefined : '选填，如 {"templateId":8}'}
          />
        </Form.Item>

        <Form.Item name="remark" label="备注" style={{ marginBottom: 4 }}>
          <Input.TextArea rows={2} maxLength={500} placeholder="选填" />
        </Form.Item>

        {isEdit && (
          <div style={{ color: '#999', fontSize: 12 }}>
            机构/类型/名称为配置键，不可修改；如需变更请删除后重新创建（同键重建将恢复原记录）
          </div>
        )}
      </Form>
    </DraggableModal>
  );
}
