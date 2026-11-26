/**
 * 用户新增/编辑弹窗(单屏紧凑版):宽1080、一行4列、分区压扁,~700px 高不滚动
 * 契约:v3 §四字段字典(新 key:name/account/type/tenantType/sex/...)
 * - 编辑可改全部资料字段;锁定 6 项不进表单不进 payload:account/pwd/miId/status/loginStatus/delFlag
 * - ★pyCode 契约更新(2026-11-17,后端 UserListVO 已补 pyCode 并部署,page/detail 响应均含):
 *   ① 回显:编辑时回显库中已有拼音码;② 提交三态:有值原样回传/空串→undefined→cleanPayload
 *   剔除→后端按 name 自动重算;③ 联动:姓名输入 change → 清空 pyCode 框
 * - ★新增落当前机构(getMiId();无机构不提交——submit 内守卫;编辑锁定 miId 不进 payload)
 * - ★★遗留#2 已落地(本轮):education/post/level 接字典下拉(DictSelect,PT0.2.15/PT0.2.1/PT0.2.16,
 *   平台标准);提交值=字典 value(业务表只存 value 硬性契约);历史自由文本存量值 Select 无匹配
 *   时原样回显,可保留或改选;workNature/skill 待字典类型建立,保持手输
 * - ⚠️ PUT「null 不更新」:编辑时清空的选填字段不会保存为空(后端限制,底部有提示)
 */
import {
  App,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  Row,
  Select,
  Space,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import DictSelect from '@/components/DictSelect';
import DraggableModal from '@/components/DraggableModal';
import {
  createUser,
  FMT_DATE,
  FMT_DATETIME,
  USER_TENANT_TYPE,
  USER_TYPE,
  type UserVO,
  updateUser,
} from '@/services/org/user';
import { getMiId } from '@/services/tenant';
import { USER_DICT } from './dictCodes';
import {
  renderLoginStatus,
  renderStatus,
  USER_IS_TRAINEE_OPTIONS,
  USER_PRESC_CLASS_OPTIONS,
  USER_SEX_OPTIONS,
  USER_TENANT_TYPE_OPTIONS,
  USER_TYPE_OPTIONS,
} from './shared';

interface Props {
  open: boolean;
  editing: UserVO | null; // null = 新增
  onClose: () => void;
  onSaved: () => void;
}
const itemMb = { marginBottom: 8 } as const;
const C4 = { span: 6 } as const; // 一行 4 列
const Section = ({ title }: { title: string }) => (
  <Divider
    orientation="start"
    orientationMargin={0}
    style={{ margin: '6px 0 10px' }}
  >
    <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
  </Divider>
);

export default function UserFormModal({
  open,
  editing,
  onClose,
  onSaved,
}: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing && editing.id != null;
  useEffect(() => {
    if (!open) return;
    form.resetFields(); // ★时序红线:所有重置动作先行,pyCode 赋值必须在重置之后
    if (isEdit && editing) {
      form.setFieldsValue({
        ...editing,
        type: editing.type != null ? String(editing.type) : undefined,
        tenantType:
          editing.tenantType != null
            ? String(editing.tenantType)
            : USER_TENANT_TYPE.HOSPITAL,
        sex: editing.sex != null ? String(editing.sex) : undefined,
        isTrainee:
          editing.isTrainee != null ? String(editing.isTrainee) : undefined,
        prescClass:
          editing.prescClass != null ? String(editing.prescClass) : undefined,
        entryDate: editing.entryDate ? dayjs(editing.entryDate) : undefined,
        authStartTime: editing.authStartTime
          ? dayjs(editing.authStartTime)
          : undefined,
        authEndTime: editing.authEndTime
          ? dayjs(editing.authEndTime)
          : undefined,
        // ★pyCode:回显库中已有值;null/undefined 归一为 '';列表页 openEdit 先上行数据、
        // detail 返回后 setEditing 二次触发本 effect,以 detail 为准覆盖
        pyCode: editing.pyCode ?? '',
      });
    } else {
      form.setFieldsValue({
        type: USER_TYPE.ORG_USER,
        tenantType: USER_TENANT_TYPE.HOSPITAL,
      });
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const toStr = (v: Dayjs | null | undefined, f: string) =>
    v ? v.format(f) : undefined;
  const submit = async () => {
    const v = await form.validateFields();
    // ★机构守卫(仅新增):未选机构(平台级)不提交——不能落 miId=null 的脏用户
    const curMiId = getMiId();
    if (!isEdit && curMiId == null) {
      message.error('未选择机构,请先选择机构后再创建用户');
      return;
    }
    setSaving(true);
    try {
      // 资料字段(新增/编辑同构);空串在 services 层 cleanPayload 统一剔除(v3 §五)
      const profile = {
        name: v.name,
        // ★pyCode 提交三态(链路勿改):有值原样回传;空串 → undefined → 剔除 → 后端按 name 重算
        pyCode: v.pyCode || undefined,
        phone: v.phone,
        type: v.type,
        tenantType: v.tenantType,
        sex: v.sex,
        idCard: v.idCard,
        education: v.education, // ★遗留#2 已落地:字典 value(PT0.2.15);清空 → 剔除 → 后端置空
        entryDate: toStr(v.entryDate, FMT_DATE),
        tel: v.tel,
        email: v.email,
        post: v.post, // ★遗留#2 已落地:字典 value(PT0.2.1)
        position: v.position,
        level: v.level, // ★遗留#2 已落地:字典 value(PT0.2.16)
        skill: v.skill, // 【待建】工作性质/擅长领域字典类型未建立,暂自由文本
        workNature: v.workNature, // 【待建】同上
        isTrainee: v.isTrainee,
        certNo: v.certNo,
        authStartTime: toStr(v.authStartTime, FMT_DATETIME),
        authEndTime: toStr(v.authEndTime, FMT_DATETIME),
        prescClass: v.prescClass,
      };
      if (isEdit && editing) {
        const res = await updateUser({ id: editing.id, ...profile });
        message.success(res?.message || '修改成功');
      } else {
        const res = await createUser({
          account: v.account, // 不 trim:区分大小写(services 层豁免)
          pwd: v.pwd || undefined, // 留空 → 后端默认 123456
          miId: curMiId ?? undefined,
          ...profile,
        });
        message.success(res?.message || '创建成功');
      }
      onSaved();
    } catch (e) {
      message.error((e as Error).message); // 后端原文透传;弹窗保持开启
    } finally {
      setSaving(false);
    }
  };

  return (
    <DraggableModal
      title={isEdit ? '编辑用户' : '新增用户'}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnClose
      width={1080}
      centered
      styles={{
        body: {
          maxHeight: 'calc(100vh - 210px)',
          overflowY: 'auto',
          paddingTop: 4,
        },
      }}
    >
      <Form form={form} layout="vertical">
        {/* ── 核心信息 ── */}
        <Row gutter={12}>
          <Col {...C4}>
            <Form.Item
              name="account"
              label="账号"
              rules={[{ required: true, message: '请输入账号' }]}
              style={itemMb}
            >
              <Input
                placeholder="唯一、区分大小写(Admin ≠ admin)"
                disabled={isEdit}
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item
              name="name"
              label="姓名"
              rules={[{ required: true, message: '请输入姓名' }]}
              style={itemMb}
            >
              {/* ★联动:姓名变更 → 清空 pyCode——留空保存 = 后端按新姓名重算;setFieldsValue 不触发 onChange */}
              <Input
                placeholder="如 张三"
                maxLength={48}
                onChange={() => form.setFieldsValue({ pyCode: '' })}
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="phone" label="手机号" style={itemMb}>
              <Input placeholder="选填" maxLength={32} />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="type" label="用户类型" style={itemMb}>
              <Select
                options={USER_TYPE_OPTIONS}
                placeholder="默认:医疗机构普通用户"
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C4}>
            <Form.Item
              name="tenantType"
              label="租户类型"
              rules={[{ required: true, message: '请选择租户类型' }]}
              style={itemMb}
            >
              <Select options={USER_TENANT_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="pyCode" label="拼音码" style={itemMb}>
              <Input
                placeholder="留空保存后按姓名自动生成;可手填覆盖"
                maxLength={32}
                allowClear
              />
            </Form.Item>
          </Col>
          {isEdit ? (
            <Col {...C4}>
              <Form.Item label="账号状态" style={itemMb}>
                <Space size={4}>
                  {renderStatus(editing?.status)}
                  {renderLoginStatus(editing?.loginStatus)}
                </Space>
              </Form.Item>
            </Col>
          ) : (
            <Col {...C4}>
              <Form.Item
                name="pwd"
                label="初始密码"
                rules={[{ min: 6, message: '至少 6 位' }]}
                style={itemMb}
              >
                <Input.Password
                  placeholder="默认 123456"
                  autoComplete="new-password"
                />
              </Form.Item>
            </Col>
          )}
        </Row>

        {/* ── 基础资料(§四)── */}
        <Section title="基础资料" />
        <Row gutter={12}>
          <Col {...C4}>
            <Form.Item name="sex" label="性别" style={itemMb}>
              <Select
                allowClear
                options={USER_SEX_OPTIONS}
                placeholder="选填"
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="education" label="学历" style={itemMb}>
              {/* ★遗留#2 已落地:字典下拉(PT0.2.15,平台标准);提交 value;平台项带「（标准）」后缀;
                  本地过滤 label/pinyin;历史自由文本存量值无匹配 → 原样回显 */}
              <DictSelect
                dictCode={USER_DICT.education}
                placeholder="选填"
                allowClear
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="idCard" label="身份证号" style={itemMb}>
              <Input placeholder="选填" maxLength={64} />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="entryDate" label="入职日期" style={itemMb}>
              <DatePicker
                style={{ width: '100%' }}
                format={FMT_DATE}
                placeholder="选填"
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C4}>
            <Form.Item name="tel" label="固定电话" style={itemMb}>
              <Input placeholder="选填" maxLength={32} />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="email" label="电子邮箱" style={itemMb}>
              <Input placeholder="选填" maxLength={64} />
            </Form.Item>
          </Col>
        </Row>

        {/* ── 执业信息(§四)── */}
        <Section title="执业信息" />
        <Row gutter={12}>
          <Col {...C4}>
            <Form.Item name="post" label="岗位" style={itemMb}>
              {/* ★遗留#2 已落地:字典下拉(PT0.2.1);label 与列表「岗位」列名对齐 */}
              <DictSelect
                dictCode={USER_DICT.post}
                placeholder="选填"
                allowClear
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="position" label="职务" style={itemMb}>
              <Input placeholder="选填" maxLength={64} />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="level" label="职称/级别" style={itemMb}>
              {/* ★遗留#2 已落地:字典下拉(PT0.2.16 职称);label 与列表「职称/级别」列名一致 */}
              <DictSelect
                dictCode={USER_DICT.level}
                placeholder="选填"
                allowClear
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="workNature" label="工作性质" style={itemMb}>
              {/* 【待建】工作性质字典类型未建立(见 dictCodes.ts 待建清单),保持手输 */}
              <Input placeholder="选填(字典类型待建立)" maxLength={94} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C4}>
            <Form.Item name="skill" label="擅长领域" style={itemMb}>
              {/* 【待建】擅长领域字典类型未建立,保持手输 */}
              <Input placeholder="选填(字典类型待建立)" maxLength={64} />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="isTrainee" label="实习生" style={itemMb}>
              <Select
                allowClear
                options={USER_IS_TRAINEE_OPTIONS}
                placeholder="选填"
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="certNo" label="执业证书编号" style={itemMb}>
              <Input placeholder="选填" maxLength={64} />
            </Form.Item>
          </Col>
        </Row>

        {/* ── 麻精处方权(§四)── */}
        <Section title="麻精处方权" />
        <Row gutter={12}>
          <Col {...C4}>
            <Form.Item name="authStartTime" label="开始时间" style={itemMb}>
              <DatePicker
                showTime
                style={{ width: '100%' }}
                format={FMT_DATETIME}
                placeholder="选填"
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item
              name="authEndTime"
              label="结束时间"
              style={itemMb}
              dependencies={['authStartTime']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, v: Dayjs | null) {
                    const s = getFieldValue('authStartTime') as
                      | Dayjs
                      | undefined
                      | null;
                    if (!v || !s || !v.isBefore(s)) return Promise.resolve();
                    return Promise.reject(
                      new Error('结束时间不能早于开始时间'),
                    );
                  },
                }),
              ]}
            >
              <DatePicker
                showTime
                style={{ width: '100%' }}
                format={FMT_DATETIME}
                placeholder="选填"
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="prescClass" label="处方类别" style={itemMb}>
              <Select
                allowClear
                options={USER_PRESC_CLASS_OPTIONS}
                placeholder="选填"
              />
            </Form.Item>
          </Col>
        </Row>
        {isEdit && (
          <div style={{ color: '#999', fontSize: 12 }}>
            账号/机构不可修改;⚠️ 选填字段清空后保存不生效(后端 null
            不更新);学历/岗位/职称已接字典下拉,清空后保存将置空;
            拼音码清空保存后按姓名自动重算
          </div>
        )}
      </Form>
    </DraggableModal>
  );
}
