/**
 * 角色新增/编辑弹窗（lint 修复版）—— 契约：角色管理 v1.0 §6.1/§6.4
 * lint 修复：noNonNullAssertion——去掉 editing!.code，code 回填移入
 *            if (isEdit && editing) 守卫内（TS 收窄后直接取 editing.code，无行为变化）
 * 保留优化：新增/编辑模式区分标题·按钮文案·成功提示 / code 编辑态锁定 /
 *      校验失败自动聚焦第一个错误字段 / 提交 loading+disabled 防重复 /
 *      未保存关闭二次确认 / Section 分区（基础信息/权限范围/其他）
 * 【待后端：BE-ROLE-OPT-05】code 锁定（4101）与 uk_mi_code 唯一冲突（4102）友好错误码
 * 【待后端：BE-ROLE-OPT-08】miId 由后端从登录态强制填充，前端不渲染不提交
 */
import { App, Col, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import { useEffect, useRef, useState } from 'react';
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

/** 表单值（不含 id / miId——miId 后端登录态填充【待后端：BE-ROLE-OPT-08】） */
type RoleFormValues = Omit<RoleSaveDTO, 'id'>;

/** validateFields 拒绝结构（局部最小类型，避免 any） */
type FormValidateError = { errorFields?: { name?: unknown }[] };

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
function normalizeToForm(d: RoleVO): RoleFormValues {
  return {
    name: d.name,
    code: d.code,
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
  const savedRef = useRef(false); // 保存成功后关闭不弹「未保存确认」
  const isEdit = !!editing?.id;

  useEffect(() => {
    if (!open) return;
    savedRef.current = false; // 每次打开重置保存标记
    form.resetFields();
    if (isEdit && editing) {
      form.setFieldsValue(normalizeToForm(editing));
    } else {
      // 新增默认值对齐后端：roleType=1 dataScope=2 roleScope=2 sort=5
      form.setFieldsValue({
        roleType: ROLE_TYPE.PLATFORM,
        dataScope: DATA_SCOPE.DEPT,
        roleScope: ROLE_SCOPE.NORMAL,
        sort: 5,
      });
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 未保存确认——有改动弹确认，无改动直接关闭 */
  const handleClose = () => {
    if (savedRef.current || !form.isFieldsTouched()) {
      onClose();
      return;
    }
    Modal.confirm({
      title: '未保存的修改',
      content: '当前弹窗有未保存的修改，关闭后将丢失，确定关闭？',
      okText: '丢弃并关闭',
      okButtonProps: { danger: true },
      cancelText: '继续编辑',
      onOk: onClose,
    });
  };

  const submit = async () => {
    let v: RoleFormValues;
    try {
      v = await form.validateFields();
    } catch (err) {
      // 校验失败自动聚焦第一个错误字段
      const e = err as FormValidateError;
      const names = e.errorFields?.[0]?.name as (string | number)[] | undefined;
      const first = names?.[0];
      if (first != null) {
        form.scrollToField(first);
        form.focusField?.(first);
      }
      return;
    }
    setSaving(true);
    try {
      // lint 修复：payload 统一按新增形态构建（code 取表单值），
      // 编辑态的 code 锁定回填移入下方守卫内（TS 收窄后取 editing.code，替代 editing!.code）
      const payload: RoleSaveDTO = {
        name: v.name,
        code: v.code,
        roleType: v.roleType,
        dataScope: v.dataScope,
        roleScope: v.roleScope,
        sort: v.sort ?? 5,
        remark: v.remark, // 空串经 service 层 cleanPayload 落 NULL（§2.4）
        // miId 不提交 → 后端默认 0 平台级【待后端：BE-ROLE-OPT-08】
      };
      if (isEdit && editing) {
        // code 锁定：守卫内 TS 已收窄 editing 非空，显式覆盖 code 为原值（disabled 字段丢值双保险）
        // 【待后端：BE-ROLE-OPT-05】4101 code 锁定 / 4102 编码已存在，当前 message 透传
        const res = await updateRole({
          id: editing.id,
          ...payload,
          code: editing.code,
        });
        message.success(res?.message || '修改成功');
      } else {
        const res = await createRole(payload);
        message.success(res?.message || '创建成功');
      }
      savedRef.current = true;
      onSaved();
    } catch (e) {
      message.error((e as Error).message); // 失败透传且不关闭
    } finally {
      setSaving(false);
    }
  };

  return (
    // DraggableModal 透传 Modal 属性（okText/okButtonProps/confirmLoading）
    <DraggableModal
      title={isEdit ? '编辑角色' : '新增角色'}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      okButtonProps={{ disabled: saving }} // loading + disabled 双防重复
      okText={isEdit ? '保存' : '创建'}
      onCancel={handleClose} // 未保存确认
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
        <Section title="基础信息" />
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
                    ? '创建后不可修改'
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
              extra={<span style={{ fontSize: 12 }}>值越小越靠前</span>}
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
            本期固定平台级 0 【待后端：BE-ROLE-OPT-08】
          </div>
        )}
      </Form>
    </DraggableModal>
  );
}
