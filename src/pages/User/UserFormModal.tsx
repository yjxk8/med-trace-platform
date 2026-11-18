/**
 * 用户新增/编辑弹窗(单屏紧凑版):宽1080、一行4列、分区压扁,~700px 高不滚动
 * 契约:v3 §四字段字典(新 key:name/account/type/tenantType/sex/...)
 * - 编辑可改全部资料字段;锁定 6 项不进表单不进 payload:account/pwd/miId/status/loginStatus/delFlag
 * - ★pyCode 契约更新(2026-11-17,后端 UserListVO 已补 pyCode 并部署,page/detail 响应均含):
 *   ① 回显:编辑时回显库中已有拼音码(废除旧契约「不回显」——旧实现 pyCode:'' 显式清空,
 *      导致编辑弹窗拼音码空白,即本修复根因);
 *   ② 提交三态(★后端语义,勿改链路):有值 → 原样回传(保护手工自定义);空串 → undefined
 *      → cleanPayload 剔除 → 请求体不含 pyCode → 后端按 name 自动重算(空/null/不含三态同义);
 *   ③ 联动(产品定版):姓名输入 change → 清空 pyCode 框——留空保存 = 跟随新姓名重算,
 *      用户可随即手填覆盖;setFieldsValue 不触发 onChange,初始化/回显不会被误清
 * - ★新增落当前机构(getMiId();无机构不提交——submit 内守卫;编辑锁定 miId 不进 payload)
 * - ⚠️【遗留#2】education/post/level/skill/workNature 存字典 code,DictSelect 待字典类型编码确认后替换
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
    form.resetFields(); // ★时序红线:所有重置动作先行,pyCode 赋值必须在重置之后(任务第4点)
    if (isEdit && editing) {
      form.setFieldsValue({
        ...editing, // 新 key 同名控件自动回显;status 等无控件键被忽略
        // String 归一化全部带空值守卫——杜绝字面量 "undefined" 进 Select
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
        // ★pyCode 新契约(2026-11-17):回显库中已有值(detail/page 响应均含);
        //   null/undefined 归一为 ''(Input 空显示);不再强制清空——旧实现 pyCode:'' 即本 bug 根因。
        //   列表页 openEdit 先上行数据、detail 返回后 setEditing 二次触发本 effect,
        //   以 detail 为准覆盖——pyCode 随之覆盖,天然满足「赋值在所有重置之后」
        pyCode: editing.pyCode ?? '',
      });
    } else {
      form.setFieldsValue({
        type: USER_TYPE.ORG_USER,
        tenantType: USER_TENANT_TYPE.HOSPITAL,
        // 新增:pyCode 留空(resetFields 已清)→ 保存后后端按 name 自动生成;可手填
      });
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const toStr = (v: Dayjs | null | undefined, f: string) =>
    v ? v.format(f) : undefined;

  const submit = async () => {
    const v = await form.validateFields();
    // ★机构守卫(仅新增):未选机构(平台级)不提交——宁可不建,也不能落 miId=null 的
    // 「任何机构都看不见/管不着」的脏用户;按钮侧另有 disabled 双保险(列表页)
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
        // ★pyCode 提交三态(2026-11-17 新契约,链路勿改):
        //   有值('zfm')→ 原样回传(保护手工自定义,不被重算覆盖);
        //   空串('')→ `|| undefined` → cleanPayload 剔除 → 请求体不含 pyCode
        //   → 后端按 name 自动重算。⚠️ 这正是「清空 = 想让拼音码跟随新姓名重算」的产品语义;
        //   若此处改成 keepEmpty 直传空串反而多余(空串/undefined/不含,后端三态同义)
        pyCode: v.pyCode || undefined,
        phone: v.phone,
        type: v.type,
        tenantType: v.tenantType,
        sex: v.sex,
        idCard: v.idCard,
        education: v.education, // 字典 code【遗留#2:DictSelect 待换】
        entryDate: toStr(v.entryDate, FMT_DATE),
        tel: v.tel,
        email: v.email,
        post: v.post, // 字典 code【遗留#2】
        position: v.position,
        level: v.level, // 字典 code【遗留#2】
        skill: v.skill, // 疑似字典 code【遗留#2】
        workNature: v.workNature, // 字典 code【遗留#2】
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
          account: v.account, // 不 trim:区分大小写(Admin ≠ admin,services 层豁免)
          pwd: v.pwd || undefined, // 留空 → 后端默认 123456
          miId: curMiId ?? undefined, // ★登录所选机构(守卫已保证非-null;编辑为锁定项不进此分支)
          ...profile,
        });
        message.success(res?.message || '创建成功'); // 后端原文「创建成功,默认密码 123456」透传
      }
      onSaved();
    } catch (e) {
      // 后端原文透传;onSaved 未执行 → 弹窗保持开启,用户可改后重提
      message.error((e as Error).message);
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
      // 小屏保险丝:正常屏总高约 690px 不会触发;极端矮屏才内部滚动
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
              {/* ★联动(产品定版):姓名变更 → 清空 pyCode——留空保存 = 后端按新姓名重算;
                  用户可随即手填覆盖。setFieldsValue 不触发 onChange,回显赋值不会被误清 */}
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
              {/* 回显库中值(小写);清空+保存 = 按当前姓名重算;手填 = 原样保存 */}
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
              {/* 【遗留#2】存字典 code,DictSelect 类型编码确认后替换 */}
              <Input placeholder="选填(字典项待接入)" maxLength={64} />
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
            <Form.Item name="post" label="岗位/职称" style={itemMb}>
              {/* 【遗留#2】字典 code */}
              <Input placeholder="选填(字典项待接入)" maxLength={64} />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="position" label="职务" style={itemMb}>
              <Input placeholder="选填" maxLength={64} />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="level" label="医师级别" style={itemMb}>
              {/* 【遗留#2】字典 code */}
              <Input placeholder="选填(字典项待接入)" maxLength={64} />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="workNature" label="工作性质" style={itemMb}>
              {/* 【遗留#2】字典 code;DDL 94 疑为 64 笔误,按可存 94(v2 §四结论沿用) */}
              <Input placeholder="选填(字典项待接入)" maxLength={94} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C4}>
            <Form.Item name="skill" label="擅长领域" style={itemMb}>
              {/* 【遗留#2】疑似字典 code,待确认 */}
              <Input placeholder="选填" maxLength={64} />
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

        {/* ── 麻精处方权(§四;end ≥ start 前端镜像 §五,后端仍兜底)── */}
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
            不更新);学历/岗位/级别等待字典项接入;拼音码清空保存后按姓名自动重算
          </div>
        )}
      </Form>
    </DraggableModal>
  );
}
