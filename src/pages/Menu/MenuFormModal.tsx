/**
 * 菜单新增/编辑弹窗 —— 契约：菜单管理 v2 §四/§五/§六
 * - menuType 联动矩阵（§6.4）：0目录(组件区隐藏) / 1菜单(component/componentName 必填*) / 2按钮(仅 name+perms+父级)
 *   *「建议必填」的前端强化实现，要放宽删对应 rules 即可
 * - isExternal 布尔封装（§6.3）：表单内布尔（Switch），提交 boolToExt / 回显 extToBool，禁止直接绑 0/1
 *   外链=true：routing 必填（镜像后端「外链菜单必须填写路由地址」）、externalTarget 显示、组件区隐藏
 * - clientType 继承（§6.2）：新增下级默认继承父节点 clientType（可改，extra 提示断枝风险）
 * - parentId 三态（§6.1）：编辑始终提交（MenuTreeSelect 恒有值）；0=顶级
 * - queryParam JSON 前置校验（文案对齐后端「路由默认参数不是合法的 JSON」）
 * - 编辑回显走 /menu/detail/{id}（children=null）；失败兜底行数据
 * - ⚠️ 后端 null 不更新：类型/外链切换后新隐藏字段（component 等）无法清空，底部有提示
 */
import {
  App,
  Col,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Switch,
} from 'antd';
import { useEffect, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import MenuTreeSelect from '@/components/MenuTreeSelect';
import {
  boolToExt,
  CLIENT_TYPE,
  createMenu,
  EXTERNAL_TARGET,
  extToBool,
  getMenuDetail,
  MENU_STATUS,
  MENU_TYPE,
  MENU_VISIBLE,
  type MenuSaveDTO,
  type MenuTreeVO,
  updateMenu,
} from '@/services/org/menu';
import {
  CLIENT_TYPE_OPTIONS,
  EXTERNAL_TARGET_OPTIONS,
  MENU_STATUS_OPTIONS,
  MENU_TYPE_OPTIONS,
  MENU_VISIBLE_OPTIONS,
} from './shared';

interface Props {
  open: boolean;
  editing: MenuTreeVO | null; // null = 新增
  presetParentId?: number | null;
  /** 新增下级时的父节点行（§6.2 clientType/menuType 默认继承用） */
  parentRow?: MenuTreeVO | null;
  /** 新增顶级时的默认客户端类型（跟随列表页当前 Tabs） */
  defaultClientType?: string;
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

/** 任意来源（detail/行数据）→ 表单值：枚举 String 归一化 + isExternal 0/1→布尔（§6.3） */
function normalizeToForm(d: MenuTreeVO) {
  return {
    ...d,
    parentId: d.parentId ?? 0,
    menuType: d.menuType != null ? String(d.menuType) : MENU_TYPE.MENU,
    clientType: d.clientType != null ? String(d.clientType) : CLIENT_TYPE.WEB,
    status: d.status != null ? String(d.status) : MENU_STATUS.NORMAL,
    isVisible: d.isVisible != null ? String(d.isVisible) : MENU_VISIBLE.YES,
    externalTarget:
      d.externalTarget != null
        ? String(d.externalTarget)
        : EXTERNAL_TARGET.NEW_WINDOW,
    isExternal: extToBool(d.isExternal), // ★ 布尔转换层
  };
}

export default function MenuFormModal({
  open,
  editing,
  presetParentId,
  parentRow,
  defaultClientType,
  onClose,
  onSaved,
}: Props) {
  const { message } = App.useApp(); // ★ 修复：原文件用了 message 未引入
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing?.id;

  // §6.4 联动：menuType / isExternal 双观察
  const menuTypeWatch = Form.useWatch('menuType', form);
  const isExternalWatch = Form.useWatch('isExternal', form) as
    | boolean
    | undefined;
  const mt = String(menuTypeWatch ?? MENU_TYPE.MENU);
  const isButton = mt === MENU_TYPE.BUTTON;
  const isMenu = mt === MENU_TYPE.MENU;
  const ext = !!isExternalWatch;
  const showComponent = isMenu && !ext;
  const showQueryParam = !isButton && !ext;
  const showExtTarget = ext;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (isEdit && editing) {
      // §6.5：回显必须走 detail（children=null，筛选态树节点数据可能不全）；失败兜底行数据
      getMenuDetail(editing.id)
        .then((d) => form.setFieldsValue(normalizeToForm(d)))
        .catch(() => form.setFieldsValue(normalizeToForm(editing)));
    } else {
      // 新增默认值（§四 create 默认值；clientType/menuType 按 §6.2 继承父节点）
      form.setFieldsValue({
        parentId: presetParentId ?? 0,
        clientType:
          parentRow?.clientType != null
            ? String(parentRow.clientType)
            : (defaultClientType ?? CLIENT_TYPE.WEB),
        menuType: parentRow
          ? String(parentRow.menuType) === MENU_TYPE.DIR
            ? MENU_TYPE.MENU
            : MENU_TYPE.BUTTON
          : MENU_TYPE.MENU, // 目录下默认建菜单；菜单下默认建按钮
        status: MENU_STATUS.NORMAL,
        isVisible: MENU_VISIBLE.YES,
        sort: 1,
        isExternal: false, // 布尔（§6.3）
        externalTarget: EXTERNAL_TARGET.NEW_WINDOW,
      });
    }
  }, [open, editing, presetParentId, parentRow, defaultClientType]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const vMt = String(v.menuType);
      const vExt = !!v.isExternal; // 布尔 → 0/1 只在转换层发生（§6.3）
      const payload: MenuSaveDTO = {
        parentId: v.parentId ?? 0, // §6.1：编辑始终提交（0=顶级）
        name: v.name,
        menuType: v.menuType,
        clientType: v.clientType,
        sort: v.sort ?? 1,
        status: v.status,
        isVisible: v.isVisible,
        perms: v.perms,
        logo: v.logo,
        module: v.module,
        remark: v.remark,
        isExternal: boolToExt(vExt), // ★ 0=是 1=否
      };
      // §6.4 矩阵：隐藏项不提交（preserve=false 已移除表单值，此处条件双保险）
      if (vExt) {
        payload.routing = v.routing; // 后端强校验：外链必须填路由地址
        payload.externalTarget = v.externalTarget;
      } else {
        if (vMt !== MENU_TYPE.BUTTON) {
          payload.routing = v.routing;
          payload.queryParam = v.queryParam;
        }
        if (vMt === MENU_TYPE.MENU) {
          payload.component = v.component;
          payload.componentName = v.componentName;
        }
      }
      if (isEdit && editing) {
        const res = await updateMenu({ id: editing.id, ...payload });
        message.success(res?.message || '修改成功');
      } else {
        const res = await createMenu(payload);
        message.success(res?.message || '创建成功');
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <DraggableModal
      title={isEdit ? '编辑菜单' : '新增菜单'}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnClose
      width={720}
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
              name="parentId"
              label="父级菜单"
              style={itemMb}
              extra={
                <span style={{ fontSize: 12 }}>
                  切换父级即「移动菜单位置」；顶级=一级目录
                </span>
              }
            >
              {/* §6.1/§6.5：编辑态过滤自身及子树（excludeId），后端循环校验兜底 */}
              <MenuTreeSelect excludeId={editing?.id ?? null} />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="menuType" label="菜单类型" style={itemMb}>
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                options={MENU_TYPE_OPTIONS}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item
              name="name"
              label="菜单名称"
              rules={[{ required: true, message: '菜单名称不能为空' }]}
              style={itemMb}
            >
              <Input placeholder="必填" maxLength={255} />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item
              name="clientType"
              label="客户端类型"
              style={itemMb}
              extra={
                <span style={{ fontSize: 12 }}>
                  子菜单建议与父级一致，否则按客户端过滤会断枝（§6.2）
                </span>
              }
            >
              <Select options={CLIENT_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item name="status" label="状态" style={itemMb}>
              <Select options={MENU_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="isVisible" label="是否可见" style={itemMb}>
              <Select options={MENU_VISIBLE_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item
              name="sort"
              label="排序"
              style={itemMb}
              extra={
                <span style={{ fontSize: 12 }}>同级排序，值越小越靠前</span>
              }
            >
              <InputNumber min={0} max={9999} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item
              name="perms"
              label="权限标识"
              style={itemMb}
              extra={
                <span style={{ fontSize: 12 }}>
                  如 menu:create（RBAC 预留，本期只存；按钮类型的核心字段）
                </span>
              }
            >
              <Input placeholder="模块:资源:操作" maxLength={100} />
            </Form.Item>
          </Col>
        </Row>

        <Section title="外链与路由" />
        <Row gutter={12}>
          <Col {...C2}>
            {/* §6.3：布尔开关，禁止直接绑 0/1 */}
            <Form.Item
              name="isExternal"
              label="是否外链"
              valuePropName="checked"
              style={itemMb}
              extra={
                <span style={{ fontSize: 12 }}>
                  外链菜单的路由地址填完整 URL
                </span>
              }
            >
              <Switch checkedChildren="外链" unCheckedChildren="站内" />
            </Form.Item>
          </Col>
          {showExtTarget && (
            <Col {...C2}>
              <Form.Item
                name="externalTarget"
                label="跳转方式"
                style={itemMb}
                preserve={false}
              >
                <Select options={EXTERNAL_TARGET_OPTIONS} />
              </Form.Item>
            </Col>
          )}
        </Row>
        {!isButton && (
          <Form.Item
            name="routing"
            label="路由地址"
            style={itemMb}
            preserve={false}
            rules={
              ext
                ? [{ required: true, message: '外链菜单必须填写路由地址' }] // 镜像后端强校验（§五）
                : isMenu
                  ? [
                      {
                        required: true,
                        message: '请填写路由地址（动态路由渲染依赖）',
                      },
                    ] // §6.4 建议必填→前端强化
                  : []
            }
          >
            <Input
              maxLength={255}
              placeholder={
                ext
                  ? '完整 URL，如 https://example.com/page'
                  : '如 /system/menu'
              }
            />
          </Form.Item>
        )}
        {showComponent && (
          <Row gutter={12}>
            <Col {...C2}>
              <Form.Item
                name="component"
                label="组件地址"
                style={itemMb}
                preserve={false}
                rules={[
                  {
                    required: true,
                    message: '请填写组件地址，如 system/menu/index',
                  },
                ]}
              >
                <Input maxLength={250} placeholder="如 system/menu/index" />
              </Form.Item>
            </Col>
            <Col {...C2}>
              <Form.Item
                name="componentName"
                label="组件名"
                style={itemMb}
                preserve={false}
                rules={[
                  {
                    required: true,
                    message: '请填写组件名（前端路由 name，keep-alive 用）',
                  },
                ]}
              >
                <Input maxLength={250} placeholder="如 Menu" />
              </Form.Item>
            </Col>
          </Row>
        )}
        {showQueryParam && (
          <Form.Item
            name="queryParam"
            label="路由默认参数（JSON）"
            style={itemMb}
            preserve={false}
            rules={[
              {
                validator: (_, v: string) => {
                  if (!v || !String(v).trim()) return Promise.resolve();
                  try {
                    JSON.parse(v);
                    return Promise.resolve();
                  } catch {
                    return Promise.reject(
                      new Error('路由默认参数不是合法的 JSON'),
                    ); // 文案对齐后端 §五
                  }
                },
              },
            ]}
          >
            <Input.TextArea rows={2} placeholder='选填，如 {"id":1}' />
          </Form.Item>
        )}

        <Section title="其他" />
        <Row gutter={12}>
          <Col {...C2}>
            <Form.Item name="logo" label="菜单图标" style={itemMb}>
              <Input
                placeholder="选填【§八#3 URL/icon 约定待定】"
                maxLength={255}
              />
            </Form.Item>
          </Col>
          <Col {...C2}>
            <Form.Item name="module" label="模块名称" style={itemMb}>
              <Input
                placeholder="选填，如 system【§八#4 取值约定待定】"
                maxLength={64}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="remark" style={{ marginBottom: 4 }}>
          <Input.TextArea rows={2} placeholder="备注，选填" maxLength={255} />
        </Form.Item>

        {isEdit && (
          <div style={{ color: '#999', fontSize: 12 }}>
            物理删除不可恢复（请用列表操作，且需先删子菜单）；类型/外链切换后新隐藏的字段无法清空（后端
            null 不更新）
          </div>
        )}
      </Form>
    </DraggableModal>
  );
}
