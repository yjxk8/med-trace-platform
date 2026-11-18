/**
 * 用户组新建/编辑弹窗（单屏紧凑版 v2 视觉整理）：宽1080、一行4列、Section 分区，~430px 不滚动
 * 视觉原则：全列等高——提示上收为分区右侧 hint，不用字段级 extra 拉高行；
 * UI 文案人话化（miId/接口名/遗留编号不出现，只留代码注释）；布局调整零业务逻辑改动
 * 校验/回显/payload 与 v1 完全一致：4202 前置、deptScope 结构化、麻精必填失效日期
 * ★M2：到期动作提示改 Form.useWatch（原 getFieldValue 不随切换刷新）
 * ★A4：fetchUserOptions 收口到唯一来源 services/org/user
 */
import {
  Alert,
  App,
  Col,
  DatePicker,
  Form,
  Input,
  Radio,
  Row,
  Select,
  Switch,
  Tooltip,
  TreeSelect,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import { type DeptTreeNode, getDeptTree } from '@/services/org/dept';
import { fetchUserOptions, type UserOptionVO } from '@/services/org/user'; // ★A4
import {
  createUserGroup,
  type DeptScope,
  GROUP_TYPE,
  type UserGroupVO,
  updateUserGroup,
} from '@/services/org/userGroup';
import { getMiId } from '@/services/tenant';
import {
  AUTO_EXPIRE_OPTIONS,
  DEPT_TYPE_OPTIONS,
  GROUP_TYPE_OPTIONS,
} from './shared';

interface Props {
  open: boolean;
  editing: UserGroupVO | null; // null = 新建
  onClose: () => void;
  onSaved: () => void;
}

const itemMb = { marginBottom: 8 } as const;
const C4 = { span: 6 } as const; // 一行 4 列
const C2 = { span: 12 } as const; // 一行 2 列（宽控件）

/** 分区标题：左侧蓝色锚点 + 右侧一句 hint（替代字段级 extra，保证全列等高） */
const Section = ({
  title,
  hint,
  first,
}: {
  title: string;
  hint?: string;
  first?: boolean;
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      margin: first ? '2px 0 12px' : '16px 0 12px',
    }}
  >
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: '20px',
      }}
    >
      <span
        style={{
          width: 3,
          height: 14,
          borderRadius: 2,
          background: '#1677ff',
          marginRight: 8,
        }}
      />
      {title}
    </span>
    {hint && <span style={{ color: '#999', fontSize: 12 }}>{hint}</span>}
  </div>
);

/** 后端树 → TreeSelect 数据（禁用节点置灰；药库/药房标注） */
function toTreeData(nodes: DeptTreeNode[]): {
  title: string;
  value: number;
  disabled?: boolean;
  children?: ReturnType<typeof toTreeData>;
}[] {
  return nodes.map((d) => ({
    title:
      d.deptType === '51' || d.deptType === '52'
        ? `${d.deptName}（${d.deptType === '51' ? '药库' : '药房'}）`
        : d.deptName,
    value: d.id,
    disabled: String(d.deptStatus) === '2',
    children: d.children?.length ? toTreeData(d.children) : undefined,
  }));
}

export default function GroupFormModal({
  open,
  editing,
  onClose,
  onSaved,
}: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [deptTree, setDeptTree] = useState<ReturnType<typeof toTreeData>>([]);
  const [ownerOptions, setOwnerOptions] = useState<UserOptionVO[]>([]);
  const isEdit = !!editing && editing.id != null;
  const miId = isEdit ? Number(editing?.miId ?? 0) : (getMiId() ?? 0);
  // ★C2 集成点已自动完成:getMiId 现代理 orgContext,切机构(整页刷新)后弹窗自然拿新机构;
  //   文件头「本阶段暂用登录机构」三行注释可删

  const narcotic = Form.useWatch('isNarcoticGroup', form);
  const groupType = Form.useWatch('groupType', form);
  const autoExpireAction = Form.useWatch('autoExpireAction', form); // ★M2：实时随切换刷新

  useEffect(() => {
    if (!open) return;
    form.resetFields();

    // 部门树 + 负责人候选（均按当前机构）
    getDeptTree({ miId })
      .then((t) => setDeptTree(toTreeData(t)))
      .catch((e) => message.error((e as Error).message));
    fetchUserOptions({ miId })
      .then((l) =>
        setOwnerOptions(
          l.map((u) => ({
            ...u,
            name: u.account ? `${u.name}（${u.account}）` : u.name,
          })),
        ),
      )
      .catch(() => setOwnerOptions([])); // 反馈③契约未明，失败不阻塞表单

    if (isEdit && editing) {
      // deptScope 回显：JSON.parse + try-catch（脏数据防御）
      let scope: DeptScope = {};
      try {
        scope = editing.deptScope
          ? (JSON.parse(editing.deptScope) as DeptScope)
          : {};
      } catch {
        scope = {};
      }
      form.setFieldsValue({
        groupCode: editing.groupCode,
        groupName: editing.groupName,
        groupType:
          editing.groupType != null
            ? String(editing.groupType)
            : GROUP_TYPE.SPECIAL,
        deptIds: scope.deptIds ?? [],
        deptTypes: scope.deptTypes ?? [],
        posts: scope.posts ?? [],
        isNarcoticGroup: String(editing.isNarcoticGroup) === '1',
        validFrom: editing.validFrom ? dayjs(editing.validFrom) : undefined,
        validTo: editing.validTo ? dayjs(editing.validTo) : undefined,
        autoExpireAction:
          editing.autoExpireAction != null
            ? String(editing.autoExpireAction)
            : '3',
        ownerUserId: editing.ownerUserId ?? undefined,
        remark: editing.remark ?? undefined,
      });
    } else {
      form.setFieldsValue({
        groupType: GROUP_TYPE.SPECIAL,
        autoExpireAction: '3',
        isNarcoticGroup: false,
      });
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const v = await form.validateFields(); // 4202 类校验已在此本地拦截
    setSaving(true);
    try {
      const needScope =
        v.groupType === GROUP_TYPE.DEPT || v.groupType === GROUP_TYPE.POST;
      const payload = {
        id: editing?.id,
        groupCode: v.groupCode,
        groupName: v.groupName,
        miId,
        groupType: v.groupType,
        // type=1/2 才携带 deptScope；3/4 不传（后端按需）
        deptScope: needScope
          ? JSON.stringify({
              deptIds: v.deptIds ?? [],
              deptTypes: v.deptTypes ?? [],
              posts: v.posts ?? [],
            })
          : undefined,
        isNarcoticGroup: v.isNarcoticGroup ? '1' : '2',
        validFrom: v.validFrom ? v.validFrom.format('YYYY-MM-DD') : undefined,
        validTo: v.validTo ? v.validTo.format('YYYY-MM-DD') : undefined,
        autoExpireAction: v.autoExpireAction,
        ownerUserId: v.ownerUserId,
        remark: v.remark?.trim() || undefined, // 空串 → undefined
      };
      const res = isEdit
        ? await updateUserGroup(payload)
        : await createUserGroup(payload);
      message.success(res?.message || (isEdit ? '修改成功' : '创建成功'));
      onSaved();
    } catch (e) {
      // 4201「组编码已存在，请更换」等后端原文透传；弹窗保持开启
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DraggableModal
      title={isEdit ? '编辑用户组' : '新建用户组'}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnHidden
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
      {narcotic && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 8 }}
          message="麻精敏感组：成员需资质预检，失效日期必填"
        />
      )}
      <Form form={form} layout="vertical">
        {/* ── 基本信息 ── */}
        <Section
          title="基本信息"
          first
          hint={
            isEdit
              ? '组编码与所属机构创建后锁定'
              : '组编码唯一性由后端校验，重复将提示更换'
          }
        />
        <Row gutter={12}>
          <Col {...C4}>
            <Form.Item
              name="groupCode"
              label="组编码"
              style={itemMb}
              rules={[
                { required: true, message: '请输入组编码' },
                { max: 64, message: '不超过 64 字' },
              ]}
            >
              <Input
                placeholder="创建后锁定"
                maxLength={64}
                disabled={isEdit}
                suffix={
                  isEdit ? (
                    <Tooltip title="创建后锁定（后端忽略修改）">
                      <span style={{ color: '#bfbfbf', fontSize: 12 }}>
                        锁定
                      </span>
                    </Tooltip>
                  ) : undefined
                }
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item
              name="groupName"
              label="组名称"
              style={itemMb}
              rules={[
                { required: true, message: '请输入组名称' },
                { max: 64, message: '不超过 64 字' },
              ]}
            >
              <Input maxLength={64} placeholder="如 麻精药品管理组" />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item label="所属机构" style={itemMb}>
              <Input
                disabled
                value={
                  isEdit
                    ? `ID：${miId}（创建后锁定）`
                    : `当前登录机构（ID：${miId}）`
                }
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="ownerUserId" label="负责人" style={itemMb}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={ownerOptions.map((u) => ({
                  value: u.id,
                  label: u.name,
                }))}
                placeholder="选填，可搜索"
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item
              name="groupType"
              label="组类型"
              style={itemMb}
              rules={[{ required: true }]}
            >
              <Radio.Group
                options={GROUP_TYPE_OPTIONS}
                optionType="button"
                buttonStyle="solid"
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item
              name="isNarcoticGroup"
              label="麻精敏感组"
              valuePropName="checked"
              style={itemMb}
            >
              <Switch checkedChildren="是" unCheckedChildren="否" />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item
              name="autoExpireAction"
              label="到期动作"
              style={itemMb}
              rules={[{ required: true }]}
              extra={
                autoExpireAction === '1'
                  ? '该动作仅记录，不发送通知'
                  : undefined
              }
            >
              <Select options={AUTO_EXPIRE_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>

        {/* ── 生效范围 ── */}
        <Section
          title="生效范围"
          hint="科室组/岗位组必须选择范围部门；岗位为自由输入"
        />
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item
              name="deptIds"
              label="范围部门"
              style={itemMb}
              dependencies={['groupType']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, v: number[]) {
                    const t = getFieldValue('groupType');
                    if (t !== GROUP_TYPE.DEPT && t !== GROUP_TYPE.POST)
                      return Promise.resolve();
                    return v?.length
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error('科室组/岗位组必须配置范围部门'),
                        );
                  },
                }),
              ]}
            >
              <TreeSelect
                multiple
                treeCheckable
                showCheckedStrategy={TreeSelect.SHOW_ALL}
                treeData={deptTree}
                placeholder={
                  groupType === GROUP_TYPE.DEPT || groupType === GROUP_TYPE.POST
                    ? '必选（可多选）'
                    : '选填'
                }
                maxTagCount={4}
                allowClear
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="deptTypes" label="范围部门类型" style={itemMb}>
              <Select
                mode="multiple"
                allowClear
                maxTagCount={2}
                options={DEPT_TYPE_OPTIONS}
                placeholder="选填"
              />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item name="posts" label="范围岗位" style={itemMb}>
              {/* 岗位为自由输入，岗位字典待接入【遗留#2】 */}
              <Select
                mode="tags"
                tokenSeparators={[',']}
                maxTagCount={2}
                placeholder="输入后回车，可多个"
              />
            </Form.Item>
          </Col>
        </Row>

        {/* ── 有效期与备注 ── */}
        <Section
          title="有效期与备注"
          hint="麻精敏感组与临时组必须填写失效日期"
        />
        <Row gutter={12}>
          <Col {...C4}>
            <Form.Item name="validFrom" label="生效日期" style={itemMb}>
              <DatePicker style={{ width: '100%' }} placeholder="选填" />
            </Form.Item>
          </Col>
          <Col {...C4}>
            <Form.Item
              name="validTo"
              label="失效日期"
              style={itemMb}
              dependencies={['validFrom', 'isNarcoticGroup', 'groupType']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, v: Dayjs | null | undefined) {
                    const narc = getFieldValue('isNarcoticGroup');
                    const t = getFieldValue('groupType');
                    if (!v && (narc || t === GROUP_TYPE.TEMP))
                      return Promise.reject(
                        new Error(
                          narc
                            ? '麻精敏感组必须填写失效日期'
                            : '临时组必须填写失效日期',
                        ),
                      );
                    const s = getFieldValue('validFrom') as
                      | Dayjs
                      | undefined
                      | null;
                    if (v && s && v.isBefore(s, 'day'))
                      return Promise.reject(
                        new Error('失效日期不能早于生效日期'),
                      );
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <DatePicker
                style={{ width: '100%' }}
                placeholder="麻精/临时组必填"
              />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="remark" label="备注" style={itemMb}>
              <Input.TextArea
                placeholder="选填"
                maxLength={255}
                autoSize={{ minRows: 1, maxRows: 4 }}
              />
            </Form.Item>
          </Col>
        </Row>
        {isEdit && (
          <div style={{ color: '#999', fontSize: 12, marginTop: 2 }}>
            组编码/机构不可修改；选填字段清空后保存不生效（后端 null 不更新）
          </div>
        )}
      </Form>
    </DraggableModal>
  );
}
