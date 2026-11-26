/**
 * 字典项 新增/编辑弹窗（契约校准版）
 * 红线（《关键点.md》§6.1/§6.4/坑#4/坑#6）：
 * - 新增：lockDictCode=true（合并页：右侧已选中类型，新增即为其添加）→ 类型锁定回显；
 *   否则 dictCode 用 Select（数据源 /type/options 由页面透传）；选中 platform=true 类型 →
 *   提交阻断 + 弹窗内 Alert 指引（后端 4601 同文案兜底透传）
 * - 机构 miId：新增自动继承当前登录机构且 disabled（服务层 getMiIdRequired 注入）；
 *   编辑锁定回显（-1 显示"平台级"）
 * - 编辑：dictCode/miId disabled（坑#6 后端锁定，传了也被忽略）
 * - 修改 dictValue → 内联提示「修改键值会影响已引用该值的历史数据翻译」（dictValue 修改可改但需警示）
 * - ★pinyin 三态（坑#4）：
 *   ① 手动接管过输入框（含清空）→ 提交始终携带：值=手填、''=按新 label 重算（显式意图）；
 *   ② 编辑改了 label 且未接管拼音 → 显式传 '' 触发重算（⚠️ 不传=保留旧值，与输入框已清空的
 *      视觉暗示不一致，故必须显式 ''）；
 *   ③ 新增未接管 → 不携带，后端自动生成（§2.2：留空自动生成）
 * - 清空语义（坑#4）：remark/cssClass 传 null 无效、传 '' 生效——Input 清空后自然为 ''，无需特判
 * - cssClass：前端确认【保留】（文档待解决#3 的回复），折叠进「高级」Collapse
 * - dictSort【待核对：DTO 是否含此字段】，多余字段后端忽略不报错，先保留传参
 * - 4605 → dictValue 内联标红「键值已存在」；400/500/4604 → message.error(后端原文)
 */
import {
  Alert,
  App,
  Col,
  Collapse,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Switch,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import { useDict } from '@/hooks/useDict';
import { useMiNames } from '@/hooks/useMi';
import {
  createDictData,
  DICT_ERR,
  type DictDataVO,
  type DictItemVO,
  getBizCode,
  setDictDataStatus,
  updateDictData,
} from '@/services/dict';
import { useOrgId } from '@/utils/orgContext';
import { isOn } from './shared';

interface Props {
  open: boolean;
  editing: DictDataVO | null; // null = 新增
  /** 新增时的所属类型（lockDictCode 时为锁定值；否则为预选初值，弹窗内可改选） */
  dictCode?: string;
  /** true = 锁定所属类型（合并页：右侧已选中类型，禁止在弹窗内改选，防新增项落不到当前右表） */
  lockDictCode?: boolean;
  /** 类型选择数据源（/type/options 仅启用类型；页面透传防弹窗重复请求） */
  typeOptions: DictItemVO[];
  onClose: () => void;
  onSaved: () => void;
}

/** 紧凑行距 */
const itemMb = { marginBottom: 14 } as const;

export default function DataModal({
  open,
  editing,
  dictCode,
  lockDictCode,
  typeOptions,
  onClose,
  onSaved,
}: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [statusOn, setStatusOn] = useState(true);
  /** 编辑态改过 dictValue → 内联「影响历史翻译」提示 */
  const [valueDirty, setValueDirty] = useState(false);
  const { invalidate } = useDict();
  const orgId = useOrgId();
  const nameOf = useMiNames();
  /** 拼音是否被手动接管（含清空）：接管后提交始终携带（坑#4 三态①） */
  const pinyinTouched = useRef(false);
  /** 编辑态 label 是否被改：未接管拼音时提交显式 pinyin:'' 触发重算（坑#4 三态②） */
  const labelDirty = useRef(false);

  /** 弹窗内选中的类型（新增且未锁定时才有意义；规则：platform=true 阻断新增） */
  const dictCodeValue = Form.useWatch('dictCode', form);
  const selectedOption = typeOptions.find((o) => o.value === dictCodeValue);
  const lockedOption = lockDictCode
    ? typeOptions.find((o) => o.value === dictCode)
    : undefined;
  const selectedIsPlatform =
    !editing &&
    (lockDictCode ? !!lockedOption?.platform : !!selectedOption?.platform);

  useEffect(() => {
    if (!open) return;
    pinyinTouched.current = false; // 回显值不视为「手工指定」
    labelDirty.current = false;
    setValueDirty(false);
    form.resetFields();
    form.setFieldsValue(
      editing
        ? {
            dictLabel: editing.dictLabel,
            dictValue: editing.dictValue,
            dictSort: editing.dictSort ?? undefined,
            pinyin: String(editing.pinyin ?? ''),
            cssClass: editing.cssClass ?? undefined,
            remark: editing.remark ?? undefined,
          }
        : { pinyin: '', dictCode: lockDictCode ? undefined : dictCode },
    );
    setStatusOn(editing ? isOn(editing.status) : true);
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    // platform=true 阻断新增（页面按钮已置灰；弹窗内改选/锁定平台类型由此守卫兜底）
    // if (selectedIsPlatform) return;
    const v = await form.validateFields();
    setSaving(true);
    try {
      // ★坑#4 三态构造（见文件头）：
      let pyField: { pinyin?: string } = {};
      if (pinyinTouched.current) {
        pyField = { pinyin: String(v.pinyin ?? '').trim() }; // ① 手动接管：值=手填 / ''=重算
      } else if (editing && labelDirty.current) {
        pyField = { pinyin: '' }; // ② 改 label 未接管：显式 '' 重算（不传=保留旧值，视觉不一致）
      } // ③ 新增未接管：不携带 → 后端自动生成

      const submitDictCode = lockDictCode ? dictCode : v.dictCode;
      if (editing) {
        await updateDictData({
          id: editing.id,
          dictLabel: v.dictLabel,
          dictValue: v.dictValue,
          dictSort: v.dictSort, // 【待核对 DTO】
          cssClass: v.cssClass,
          remark: v.remark,
          ...pyField,
        });
        // status 后端锁定 → 独立启停接口接力（坑#6）
        const next = statusOn ? 0 : 1;
        if (next !== (isOn(editing.status) ? 0 : 1)) {
          await setDictDataStatus(editing.id, next as 0 | 1);
        }
      } else {
        await createDictData({
          dictCode: submitDictCode as string,
          dictLabel: v.dictLabel,
          dictValue: v.dictValue,
          dictSort: v.dictSort, // 【待核对 DTO】
          cssClass: v.cssClass,
          remark: v.remark,
          ...pyField,
        });
      }
      message.success(editing ? '修改成功' : '创建成功');
      invalidate(editing ? editing.dictCode : (submitDictCode as string)); // 坑#10：清本地缓存即可
      onSaved();
    } catch (e) {
      // §6.6：4605 → dictValue 内联标红；其余 → 后端原文 toast（4601 含操作指引，透传）
      if (getBizCode(e) === DICT_ERR.DATA_VALUE_DUP) {
        form.setFields([{ name: 'dictValue', errors: ['键值已存在'] }]);
      } else {
        message.error((e as Error).message);
      }
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
        {selectedIsPlatform && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="当前为平台标准字典：建议先在类型管理新增同编码院内类型(type=2)后添加本院项；直接提交将由后端校验。"
          />
        )}

        {editing ? (
          // 坑#6：编辑态 dictCode/miId 后端锁定 → disabled 回显（不进提交）
          <>
            <Form.Item label="所属类型" style={itemMb}>
              <Input value={editing.dictCode} disabled />
            </Form.Item>
            <Form.Item label="所属机构" style={itemMb}>
              <Input value={nameOf(editing.miId)} disabled />
            </Form.Item>
          </>
        ) : lockDictCode ? (
          // 合并页：类型锁定为左侧选中类型（语义：给当前类型加项）
          <Form.Item label="所属类型" style={itemMb}>
            <Input value={dictCode} disabled />
          </Form.Item>
        ) : (
          <Form.Item
            name="dictCode"
            label="所属类型"
            rules={[{ required: true, message: '请选择所属类型' }]}
            style={itemMb}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="请选择字典类型"
              options={typeOptions.map((o) => ({
                value: o.value,
                label: o.platform ? `${o.label}（标准）` : o.label,
              }))}
            />
          </Form.Item>
        )}

        {!editing && (
          // 新增：miId 自动继承当前登录机构（服务层 getMiIdRequired 注入）
          <Form.Item
            label="所属机构"
            style={itemMb}
            extra="自动继承当前登录机构，不可修改"
          >
            <Input
              value={
                orgId != null && Number(orgId) > 0
                  ? nameOf(orgId)
                  : '未获取到机构上下文'
              }
              disabled
            />
          </Form.Item>
        )}

        {/* 值域代码 / 值域名称 双列一行 */}
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item
              name="dictValue"
              label="值域代码"
              rules={[{ required: true, message: '请输入' }]}
              extra={
                editing && valueDirty ? (
                  <span style={{ color: '#faad14' }}>
                    修改键值会影响已引用该值的历史数据翻译
                  </span>
                ) : undefined
              }
              style={itemMb}
            >
              <Input
                placeholder="如 01"
                onChange={() => {
                  if (editing) setValueDirty(true);
                }}
              />
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
                  if (editing) {
                    labelDirty.current = true;
                    // 未手动接管拼音 → 同步清空输入框（视觉提示"将重算"）；接管过则尊重手填值
                    if (!pinyinTouched.current)
                      form.setFieldValue('pinyin', '');
                  }
                }}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* 排序 / 拼音首字母 双列一行 */}
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
                placeholder="留空自动按标签生成，多音字可手填"
                maxLength={50}
                allowClear
                onChange={() => {
                  // 手动输入/清空 → 人工接管：此后提交始终携带（坑#4 三态①：值=手填，''=重算）
                  pinyinTouched.current = true;
                }}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* cssClass（前端确认保留）/ remark 折叠进「高级」区 */}
        <Collapse
          ghost
          size="small"
          items={[
            {
              key: 'advanced',
              label: '高级',
              children: (
                <>
                  <Form.Item name="cssClass" label="样式类" style={itemMb}>
                    <Input placeholder="选填，如 tag-success" maxLength={100} />
                  </Form.Item>
                  <Form.Item
                    name="remark"
                    label="备注"
                    style={{ marginBottom: 8 }}
                  >
                    <Input.TextArea
                      rows={2}
                      placeholder="选填（清空提交空串即生效）"
                    />
                  </Form.Item>
                </>
              ),
            },
          ]}
        />

        {editing && (
          // status 不走编辑表单（坑#6）→ 弹窗内开关 + 保存时经独立启停接口接力
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
