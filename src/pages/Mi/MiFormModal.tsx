/**
 * 医疗机构 新增/编辑弹窗 —— 契约：医疗机构 v1 §四/§五/§六
 * - code 锁定（§6.1）：编辑禁用输入框 + payload 不含 code（MiUpdateDTO 类型层剔除，双保险）
 * - socialCode 三态（§6.2）：表单恒提交——值=修改（查重排除自身）/ 清空=""=置NULL（keepEmpty 豁免）；
 *   回显 null 显示为空
 * - parentId 三态（§6.3）：编辑恒提交（0=移到顶级）；新增选了父级才传（不传=顶级）
 * - 编辑回显走 /mi/detail/{id}（失败兜底行数据）；MiParentSelect 编辑态剔除自身及子树
 * - 删除语义提示（§6.4）：机构代码永久作废，弹窗内明示
 */
import { App, Col, Form, Input, Row, Select } from 'antd';
import { useEffect, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import MiParentSelect from '@/components/MiParentSelect';
import {
  createMi,
  getMiDetail,
  MI_STATUS,
  MI_TENANT_TYPE,
  type MiSaveDTO,
  type MiUpdateDTO,
  type MiVO,
  updateMi,
} from '@/services/org/mi';
import { MI_STATUS_OPTIONS, MI_TENANT_TYPE_OPTIONS } from './shared';

interface Props {
  open: boolean;
  editing: MiVO | null; // null = 新增
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

/** 任意来源（detail/行数据）→ 表单值：枚举 String 归一化 + socialCode null→空串（§6.2） */
function normalizeToForm(d: MiVO) {
  return {
    ...d,
    parentId: d.parentId ?? 0,
    tenantType:
      d.tenantType != null ? String(d.tenantType) : MI_TENANT_TYPE.HOSPITAL,
    status: d.status != null ? String(d.status) : MI_STATUS.NORMAL,
    socialCode: d.socialCode ?? '', // §6.2：null 回显为空，别渲染成 "null"
  };
}

export default function MiFormModal({
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
      // 回显主源 detail（数据更新鲜）；失败兜底行数据（page 出参即完整 MiVO，同构）
      getMiDetail(editing.id)
        .then((d) => form.setFieldsValue(normalizeToForm(d)))
        .catch(() => form.setFieldsValue(normalizeToForm(editing)));
    } else {
      // §四 create 默认：tenantType=1、status=1、parentId 不选=顶级
      form.setFieldsValue({
        parentId: 0,
        tenantType: MI_TENANT_TYPE.HOSPITAL,
        status: MI_STATUS.NORMAL,
      });
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      if (isEdit && editing) {
        // §6.1：code 不提交；§6.3：parentId 恒提交（0=移到顶级）；
        // §6.2：socialCode 恒提交（""=清空置NULL，keepEmpty 豁免直达）
        const payload: MiUpdateDTO = {
          id: editing.id,
          parentId: v.parentId ?? 0,
          tenantType: v.tenantType,
          name: v.name,
          orgType: v.orgType,
          orgGrade: v.orgGrade,
          coverPic: v.coverPic,
          socialCode: v.socialCode ?? '',
          licenseNo: v.licenseNo,
          province: v.province,
          city: v.city,
          county: v.county,
          village: v.village,
          street: v.street,
          houseNumber: v.houseNumber,
          postCode: v.postCode,
          headName: v.headName,
          phone: v.phone,
          telephone: v.telephone,
          website: v.website,
          mail: v.mail,
          status: v.status,
          remark: v.remark,
        };
        const res = await updateMi(payload);
        message.success(res?.message || '修改成功');
      } else {
        // §6.3/§四：新增 parentId 不传=顶级——选了父级才带（0 不传，防「父级机构不存在」误拦）
        const { parentId, ...rest } = v;
        const payload: MiSaveDTO = {
          ...rest,
          ...(Number(parentId) > 0 ? { parentId: Number(parentId) } : {}),
        };
        const res = await createMi(payload);
        message.success(res?.message || '创建成功');
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <DraggableModal
      title={isEdit ? '编辑机构' : '新增机构'}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnClose
      width={760}
      centered
      styles={{
        body: {
          maxHeight: 'calc(100vh - 200px)',
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
              label="机构名称"
              rules={[{ required: true, message: '机构名称不能为空' }]}
              style={itemMb}
            >
              <Input placeholder="必填" maxLength={100} />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item
              name="code"
              label="机构代码"
              rules={
                isEdit ? [] : [{ required: true, message: '机构代码不能为空' }]
              }
              extra={
                isEdit ? (
                  <span style={{ fontSize: 12 }}>机构代码创建后不可修改</span>
                ) : (
                  <span style={{ fontSize: 12 }}>
                    SaaS 唯一标识，创建后永久占用（删除也不释放）
                  </span>
                )
              }
              style={itemMb}
            >
              {/* §6.1：编辑禁用（后端忽略是兜底，前端禁用才是体验） */}
              <Input placeholder="如 MI001" maxLength={50} disabled={isEdit} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item
              name="parentId"
              label="父级机构"
              style={itemMb}
              extra={
                <span style={{ fontSize: 12 }}>
                  顶级=一级机构；编辑时切换即移动层级
                </span>
              }
            >
              {/* §6.3：编辑态剔除自身及子树（循环引用前置拦截） */}
              <MiParentSelect excludeId={editing?.id ?? null} />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="tenantType" label="租户类型" style={itemMb}>
              <Select options={MI_TENANT_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item name="orgType" label="机构类型" style={itemMb}>
              <Input placeholder="如 综合医院/专科医院" maxLength={20} />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="orgGrade" label="机构等级" style={itemMb}>
              <Input placeholder="如 三甲/三乙" maxLength={20} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item
              name="status"
              label="状态"
              style={itemMb}
              extra={
                <span style={{ fontSize: 12 }}>
                  关闭=业务停用（可恢复），与删除不同
                </span>
              }
            >
              <Select options={MI_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="coverPic" label="封面/LOGO" style={itemMb}>
              <Input placeholder="选填【URL 约定待补充】" maxLength={500} />
            </Form.Item>
          </Col>
        </Row>

        <Section title="证照信息" />
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item
              name="socialCode"
              label="统一社会信用代码"
              style={itemMb}
              extra={
                <span style={{ fontSize: 12 }}>
                  可空唯一；清空后保存=置为空（可重新填写）
                </span>
              }
            >
              {/* §6.2：可清空，提交统一转 ""（绝不转 null）；后端查重排除自身 */}
              <Input maxLength={50} placeholder="18 位，选填" />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="licenseNo" label="执业许可证号" style={itemMb}>
              <Input maxLength={100} placeholder="选填" />
            </Form.Item>
          </Col>
        </Row>

        <Section title="地址信息" />
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item name="province" label="省" style={itemMb}>
              <Input maxLength={30} placeholder="如 北京市" />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="city" label="市" style={itemMb}>
              <Input maxLength={30} placeholder="如 北京市" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item name="county" label="县/区" style={itemMb}>
              <Input maxLength={30} placeholder="如 东城区" />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="village" label="镇/街" style={itemMb}>
              <Input maxLength={50} placeholder="选填" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item name="street" label="村街详细地址" style={itemMb}>
              <Input maxLength={100} placeholder="选填" />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="houseNumber" label="门牌号" style={itemMb}>
              <Input maxLength={50} placeholder="选填" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item name="postCode" label="邮政编码" style={itemMb}>
              <Input maxLength={10} placeholder="如 100730" />
            </Form.Item>
          </Col>
        </Row>

        <Section title="联系方式" />
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item name="headName" label="法定代表人/负责人" style={itemMb}>
              <Input maxLength={50} placeholder="选填" />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="phone" label="联系人手机号" style={itemMb}>
              <Input maxLength={20} placeholder="选填" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item name="telephone" label="总机电话" style={itemMb}>
              <Input maxLength={20} placeholder="如 010-88888888" />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="mail" label="邮箱" style={itemMb}>
              <Input maxLength={100} placeholder="选填" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="website" label="官网" style={itemMb}>
          <Input maxLength={200} placeholder="如 https://www.xxx.cn" />
        </Form.Item>

        <Section title="备注" />
        <Form.Item name="remark" style={{ marginBottom: 4 }}>
          <Input.TextArea rows={2} maxLength={500} placeholder="选填" />
        </Form.Item>

        {isEdit && (
          <div style={{ color: '#999', fontSize: 12 }}>
            机构代码创建后不可修改；统一社会信用代码清空后保存即置为空；删除机构=代码永久作废，请谨慎操作
          </div>
        )}
      </Form>
    </DraggableModal>
  );
}
