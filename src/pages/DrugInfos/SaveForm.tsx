/**
 * 药品编辑弹窗(编辑-only,无新增)—— ModalForm + grid 三列,横向紧凑
 * ★本轮调整(字典全量接入,原硬编码选项全部移除):
 * - 毒理分类/剂型/单位族(零售/药品/剂量/体积/质量/包装三行)/费用记账方式 → DictSelect
 *   (dictCodes.ts 集中注册,平台项「（标准）」后缀,本地 label/pinyin 过滤,公共层缓存去重);
 *   提交值=字典 value(业务表只存 value 硬性契约);历史存量值无匹配原样回显
 * - 保留本地常量:drugUseStatus(业务状态非字典)/是否·有无·启用停用 radio(布尔标志)/
 *   infusionUnit 输液单位(暂文本,待确认是否并入单位字典)
 * - getDrugDetail/updateDrug 链路、GlobalStyle 行距压缩、包装表结构均不变
 */
import {
  ModalForm,
  ProFormDigit,
  ProFormRadio,
  ProFormSelect,
  ProFormText,
} from '@ant-design/pro-components';
import { App, Col, Form, InputNumber } from 'antd';
import { useEffect } from 'react';
import { createGlobalStyle } from 'styled-components';
import DictSelect from '@/components/DictSelect';
import { getDrugDetail, updateDrug } from '@/services/drugInfos';
import { DRUG_DICT } from './dictCodes';

/** 1在用 0停用(业务状态,非字典,勿改语义) */
const STATUS_OPTIONS = [
  { label: '在用', value: 1 },
  { label: '停用', value: 0 },
];
const INT_YES_NO = [
  { label: '是', value: 1 },
  { label: '否', value: 0 },
];
const INT_HAS_NO = [
  { label: '有', value: 1 },
  { label: '无', value: 0 },
];
const STR_YES_NO = [
  { label: '是', value: '1' },
  { label: '否', value: '0' },
];
/** 1启用 0停用（语义与直觉相反，勿改） */
const ENABLE_STOP = [
  { label: '启用', value: '1' },
  { label: '停用', value: '0' },
];
/** 包装信息固定三行：绑定实体平铺字段 */
const PACK_ROWS = [
  {
    unit: 'largePackageUnit',
    factor: 'largePackageFactor',
    label: '大包装单位',
  },
  {
    unit: 'mediumPackageUnit',
    factor: 'mediumPackageFactor',
    label: '二级包装',
  },
  { unit: 'smallPackageUnit', factor: 'smallPackageFactor', label: '三级包装' },
];
const LABEL_W = 150;

/**
 * Modal 传送门挂 body，须 GlobalStyle 按类名作用：
 * ① 行距 24 → 8；② 表单行禁止换行（nowrap）+ 控件 min-width:0
 */
const FormSpacingStyle = createGlobalStyle`
  .drug-edit-form .ant-form-item { margin-bottom: 8px; }
  .drug-edit-form .ant-form-item-row { flex-wrap: nowrap; }
  .drug-edit-form .ant-form-item-control { min-width: 0; }
  .drug-edit-form .ant-form-item-label > label { line-height: 1.4; }
`;

/**
 * 字典字段统一包装:ModalForm grid 模式只给 ProFormItem 自动套 Col,
 * 普通 Form.Item 需手动包 <Col span={8}> 对齐三列网格
 */
const DictCol: React.FC<{
  name: string;
  label: string;
  dictCode: string;
  placeholder?: string;
  extra?: React.ReactNode;
}> = ({ name, label, dictCode, placeholder = '请选择', extra }) => (
  <Col span={8}>
    <Form.Item name={name} label={label} extra={extra}>
      <DictSelect dictCode={dictCode} placeholder={placeholder} allowClear />
    </Form.Item>
  </Col>
);

const SaveForm: React.FC<{
  open: boolean;
  editingId: number | null;
  miId: number | null;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ open, editingId, miId, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  /* 编辑回填：平铺字段直接展开（字典字段值随 detail 原样进表单） */
  useEffect(() => {
    if (!open || editingId == null) return;
    getDrugDetail(editingId)
      .then((detail) => {
        form.setFieldsValue(detail);
      })
      .catch((e: any) => message.error(e?.message || '加载药品详情失败'));
  }, [open, editingId]);

  return (
    <>
      <FormSpacingStyle />
      <ModalForm
        title="编辑药品"
        width={1200}
        form={form}
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        modalProps={{
          destroyOnHidden: true,
          maskClosable: false,
          centered: true,
          className: 'drug-edit-form',
          styles: {
            header: { paddingTop: 14, paddingBottom: 6 },
            body: { paddingTop: 10, paddingBottom: 6 },
            footer: { paddingTop: 4, paddingBottom: 8 },
          },
        }}
        layout="horizontal"
        labelWrap
        labelCol={{ style: { width: LABEL_W } }}
        wrapperCol={{ flex: 1 }}
        grid
        rowProps={{ gutter: 12 }}
        colProps={{ span: 8 }}
        submitter={{
          searchConfig: { submitText: '保存数据' },
          resetButtonProps: false,
          render: (_, dom) => (
            <div style={{ textAlign: 'center', width: '100%' }}>{dom}</div>
          ),
        }}
        onFinish={async (values) => {
          try {
            await updateDrug({
              ...(values as Record<string, any>),
              id: editingId as number,
              miId: miId as number,
            });
            message.success('保存成功');
            onSuccess();
            return true;
          } catch (e: any) {
            message.error(e?.message || '保存失败');
            return false;
          }
        }}
      >
        {/* 行1：名称 */}
        <ProFormText
          name="phamName"
          label="药品名称"
          placeholder="请输入药品名称"
        />
        <ProFormText name="phamGeneralName" label="药品通用名称" />
        <ProFormText name="phamEName" label="药品英文名称" />

        {/* 行2：基础属性 */}
        <ProFormText name="phamSpec" label="药品规格" />
        <ProFormText name="ypid" label="药管平台码" />
        <ProFormText name="pharmacyFactory" label="厂家名称" />

        {/* 行3：编码资质（★毒理分类已接字典，原 POISON_OPTIONS 移除） */}
        <ProFormText
          name="phamStdCode"
          label="药品编码"
          disabled
          rules={[{ required: true, message: '请输入药品编码' }]}
        />
        <DictCol
          name="toxicologyProperty"
          label="毒理分类"
          dictCode={DRUG_DICT.toxicology}
        />
        <ProFormText name="qualificationCode" label="批准文件号" />

        {/* 行4：价格包装（★零售单位已接单位字典） */}
        <ProFormDigit
          name="retailPrice"
          label="零售价"
          fieldProps={{ precision: 2 }}
        />
        <DictCol
          name="packageUnit"
          label="零售单位"
          dictCode={DRUG_DICT.unit}
        />
        <ProFormDigit
          name="packageFactor"
          label="包装数量"
          tooltip="零售价包装单位中含有的基本单位数量"
          fieldProps={{ precision: 0 }}
        />

        {/* 行5：单位换算（★药品/剂量单位已接单位字典） */}
        <DictCol name="phamUnit" label="药品单位" dictCode={DRUG_DICT.unit} />
        <DictCol
          name="doseUnit"
          label="剂量单位（含量）"
          dictCode={DRUG_DICT.unit}
        />
        <ProFormDigit
          name="dosePerUnit"
          label="剂量单位换算系数"
          tooltip="最小单位与剂量单位的换算系数（历史原因 varchar，提交字符串）"
          fieldProps={{ stringMode: true }}
        />

        {/* 行6：编码（★费用记账方式已接字典【编码待核对;若非字典改回 ProFormText】） */}
        <ProFormText
          name="billModelCode"
          label="费用记账方式"
          placeholder="请输入(字典类型待建立)"
        />
        <ProFormText name="phamCode" label="院内药品编码" />
        <ProFormText
          name="drugIdentifierCode"
          label="药品标识码"
          tooltip="追溯码前 7 位"
          fieldProps={{ maxLength: 7, showCount: true }}
        />

        {/* 行7：剂型输液（★剂型已接字典;输液单位暂文本,待确认是否并入单位字典） */}
        <DictCol
          name="dosageForm"
          label="剂型"
          dictCode={DRUG_DICT.dosageForm}
        />
        <ProFormText
          name="infusionVolume"
          label="输液量"
          placeholder="请输入输液量"
        />
        <ProFormText
          name="infusionUnit"
          label="输液单位"
          placeholder="请输入输液单位"
        />

        {/* 行8：标志组一（radio 布尔标志,非字典,保留） */}
        <ProFormRadio.Group
          name="freeChargeFlag"
          label="是否收费"
          options={STR_YES_NO}
        />
        <ProFormRadio.Group
          name="unitSeparationFlag"
          label="是否可拆零"
          options={INT_YES_NO}
        />
        <ProFormRadio.Group
          name="traceabilityFlag"
          label="是否追溯"
          options={STR_YES_NO}
        />

        {/* 行9：标志组二 */}
        <ProFormRadio.Group
          name="hasRfidTraceCode"
          label="RFID追溯码"
          tooltip="是否有RFID追溯码"
          options={INT_HAS_NO}
        />
        <ProFormRadio.Group
          name="stopFlagPlan"
          label="计划停标志"
          options={ENABLE_STOP}
        />
        <ProFormRadio.Group
          name="stopFlagPur"
          label="采购停标志"
          options={ENABLE_STOP}
        />

        {/* 行10：状态与单位（★体积单位已接字典;药品状态为业务状态保留本地选项） */}
        <ProFormSelect
          name="drugUseStatus"
          label="药品状态"
          options={STATUS_OPTIONS}
        />
        <ProFormText
          name="volumeUnit"
          label="体积单位"
          placeholder="如 ml/L(字典类型待建立)"
        />
        <ProFormDigit name="qualityUnitDosage" label="质量单位剂量" />

        {/* 行11：剂量与助记（★质量单位已接字典） */}
        <DictCol
          name="qualityUnit"
          label="质量单位"
          dictCode={DRUG_DICT.qualityUnit}
        />
        <ProFormDigit name="volumeUnitDosage" label="体积单位剂量" />
        <ProFormText name="phamNameInitial" label="助记符" />

        {/* 行12：时间（只读，2 项） */}
        <ProFormText
          name="updateTime"
          label="更新时间"
          disabled
          placeholder=""
        />
        <ProFormText
          name="removalTime"
          label="停用时间"
          disabled
          placeholder=""
        />

        {/* 药品包装信息：三行固定表格（★包装单位已接单位字典,原 UNIT_OPTIONS 移除） */}
        <Col span={24}>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ width: LABEL_W, paddingTop: 4, textAlign: 'right' }}>
              药品包装信息
            </div>
            <div
              style={{
                flex: 1,
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                overflow: 'hidden',
                maxWidth: 640,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  background: '#fafafa',
                  borderBottom: '1px solid #f0f0f0',
                  fontWeight: 500,
                  fontSize: 13,
                }}
              >
                <div style={{ width: 130, padding: '4px 10px' }}>包装类型</div>
                <div style={{ flex: 1, padding: '4px 10px' }}>包装单位</div>
                <div style={{ flex: 1, padding: '4px 10px' }}>
                  与基本单位的换算系数
                </div>
              </div>
              {PACK_ROWS.map((row, i) => (
                <div
                  key={row.unit}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom:
                      i < PACK_ROWS.length - 1
                        ? '1px solid #f0f0f0'
                        : undefined,
                  }}
                >
                  <div
                    style={{ width: 130, padding: '4px 10px', fontSize: 13 }}
                  >
                    {row.label}
                  </div>
                  <div style={{ flex: 1, padding: 4 }}>
                    <Form.Item name={row.unit} noStyle>
                      <DictSelect
                        dictCode={DRUG_DICT.unit}
                        placeholder="请选择"
                        allowClear
                      />
                    </Form.Item>
                  </div>
                  <div style={{ flex: 1, padding: 4 }}>
                    <Form.Item name={row.factor} noStyle>
                      <InputNumber
                        placeholder="请输入"
                        min={0}
                        precision={0}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Col>
      </ModalForm>
    </>
  );
};

export default SaveForm;
