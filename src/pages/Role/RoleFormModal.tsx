/**
 * 角色新增/编辑弹窗 —— 契约：角色管理 v1.0 §6.1/§6.4
 * - code 锁定（§6.4）：编辑态 disabled + extra 提示；提交时强制回填 editing.code
 *   （disabled 字段若被 reset 仍可能丢值，回填是双保险，防「编码创建后不允许修改」报错）
 * - miId 本期不暴露：不传 → 后端默认 0（平台级）【待确认：是否允许前端指定】
 * - remark：空串经 cleanPayload 落 NULL（§2.4）；回显 null→undefined 防受控告警
 * - 回显用列表行数据而非 /role/detail：分页 VO 字段完整（区别于菜单树节点可能不全的场景）
 * - 新增默认值对齐后端：roleType=1 dataScope=2 roleScope=2 sort=5
 */
import { App, Col, Form, Input, InputNumber, Row, Select } from 'antd';
import { useEffect, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import {
  createRole,
  DATA_SCOPE,
  ROLE_SCOPE,
  ROLE_TYPE,
  type RoleSaveDTO,
  type RoleVO,
  updateRole,
} from '@/services/org/role';
import {
  DATA_SCOPE_OPTIONS,
  ROLE_SCOPE_OPTIONS,
  ROLE_TYPE_OPTIONS,
} from './shared';

interface Props {
  open: boolean;
  /** null = 新增 */
  editing: RoleVO | null;
  onClose: () => void;
  onSaved: () => void;
}

const itemMb = { marginBottom: 10 } as const;
const C2 = { span: 12 } as const;

/** 分区标题（div 实现，规避 antd Divider 类型版本差异） */
const Section = ({ title }: { title: string }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      margin: '6px 0 10px',
    }}
  >
    <span style={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
      {title}
    </span>
    <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
  </div>
);

/** 行数据 → 表单值：枚举缺省对齐后端默认；null→undefined */
function normalizeToForm(d: RoleVO) {
  return {
    ...d,
    roleType: d.roleType ?? ROLE_TYPE.PLATFORM,
    dataScope: d.dataScope ?? DATA_SCOPE.DEPT,
    roleScope: d.roleScope ?? ROLE_SCOPE.NORMAL,
    sort: d.sort ?? 5,
    remark: d.remark ?? undefined,
  };
}

export default function RoleFormModal({
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
      form.setFieldsValue(normalizeToForm(editing));
    } else {
      form.setFieldsValue({
        roleType: ROLE_TYPE.PLATFORM, // 后端默认 1
        dataScope: DATA_SCOPE.DEPT, // 后端默认 2
        roleScope: ROLE_SCOPE.NORMAL, // 后端默认 2
        sort: 5, // 后端默认 5，越小越靠前
      });
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      // ⚠️ code 锁定：编辑态强制回填原值（disabled 字段丢值双保险）
      const payload: RoleSaveDTO = {
        name: v.name,
        code: isEdit ? editing!.code : v.code,
        roleType: v.roleType,
        dataScope: v.dataScope,
        roleScope: v.roleScope,
        sort: v.sort ?? 5,
        remark: v.remark, // 空串经 cleanPayload 落 NULL（§2.4）
        // miId 不传 → 后端默认 0 平台级【待确认：是否允许前端指定】
      };
      if (isEdit && editing) {
        const res = await updateRole({ id: editing.id, ...payload });
        message.success(res?.message || '修改成功');
      } else {
        const res = await createRole(payload);
        message.success(res?.message || '创建成功');
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <DraggableModal
      title={isEdit ? '编辑角色' : '新增角色'}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnClose
      width={640}
      centered
      styles={{
        body: {
          maxHeight: 'calc(100vh - 220px)',
          overflowY: 'auto',
          paddingTop: 4,
        },
      }}
    >
      <Form form={form} layout="vertical">
        <Section title="基本信息" />
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item
              name="name"
              label="角色名称"
              rules={[
                { required: true, message: '角色名称不能为空' },
                { max: 255, message: '不超过 255 字符' },
              ]}
              style={itemMb}
            >
              <Input placeholder="必填" maxLength={255} />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item
              name="code"
              label="角色编码"
              extra={
                <span style={{ fontSize: 12 }}>
                  {isEdit
                    ? '编码创建后不可修改'
                    : '机构内唯一；建议小写下划线，如 hospital_pharmacist'}
                </span>
              }
              rules={[
                { required: true, message: '角色编码不能为空' },
                { max: 100, message: '不超过 100 字符' },
              ]}
              style={itemMb}
            >
              <Input placeholder="必填" maxLength={100} disabled={isEdit} />
            </Form.Item>
          </Col>
        </Row>

        <Section title="权限范围" />
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item name="roleType" label="角色类型" style={itemMb}>
              <Select options={ROLE_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item
              name="dataScope"
              label="数据范围"
              extra={
                <span style={{ fontSize: 12 }}>
                  本期仅存字段；二期接入 SQL 拦截后生效（§3）
                </span>
              }
              style={itemMb}
            >
              <Select options={DATA_SCOPE_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item name="roleScope" label="角色范围" style={itemMb}>
              <Select options={ROLE_SCOPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item
              name="sort"
              label="排序"
              extra={
                <span style={{ fontSize: 12 }}>同级排序，值越小越靠前</span>
              }
              style={itemMb}
            >
              <InputNumber min={0} max={9999} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Section title="其他" />
        <Form.Item name="remark" style={{ marginBottom: 4 }}>
          <Input.TextArea
            rows={2}
            placeholder="备注，选填（保存时空串将清空为空值）"
            maxLength={200}
            showCount
          />
        </Form.Item>
        {isEdit && (
          <div style={{ color: '#999', fontSize: 12 }}>
            角色编码创建后锁定（后端校验，传不一致值将报错）；机构归属 miId
            本期固定平台级 0 【是否开放选择待产品确认】
          </div>
        )}
      </Form>
    </DraggableModal>
  );
}
