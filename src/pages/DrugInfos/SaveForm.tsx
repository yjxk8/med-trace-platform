import {
  ModalForm,
  ProFormDigit,
  ProFormRadio,
  ProFormSelect,
  ProFormText,
} from '@ant-design/pro-components';
import { App, Col, Form, InputNumber, Select } from 'antd';
import { useEffect } from 'react';
import { createGlobalStyle } from 'styled-components';
import { getDrugDetail, updateDrug } from '@/services/drugInfos';

/* ───── 下拉选项（占位！截图里 G10/G11/G15、"10" 等真实值不在选项中，须改从「值域代码」字典加载） ───── */
const POISON_OPTIONS = [
  { label: '麻醉药品', value: '1' },
  { label: '第一类精神药品', value: '2' },
  { label: '易制毒药品', value: '3' },
];
const UNIT_OPTIONS = ['支', '丸', '片', '瓶', '盒', '袋'].map((u) => ({
  label: u,
  value: u,
}));
const QUALITY_UNIT_OPTIONS = ['mg', 'g', 'ug'].map((u) => ({
  label: u,
  value: u,
}));
const VOLUME_UNIT_OPTIONS = ['ml', 'L'].map((u) => ({ label: u, value: u }));
const DOSAGE_FORM_OPTIONS = ['片剂', '注射液', '针剂', '乳膏', '颗粒剂'].map(
  (u) => ({ label: u, value: u }),
);
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
 * ① 行距 24 → 8；② 表单行禁止换行（nowrap）+ 控件 min-width:0 ——
 * 结构性杜绝「控件掉到 label 下一行」，列宽再紧也只是控件收缩，不会折行。
 */
const FormSpacingStyle = createGlobalStyle`
  .drug-edit-form .ant-form-item {
    margin-bottom: 8px;
  }
  .drug-edit-form .ant-form-item-row {
    flex-wrap: nowrap;
  }
  .drug-edit-form .ant-form-item-control {
    min-width: 0;
  }
  .drug-edit-form .ant-form-item-label > label {
    line-height: 1.4;
  }
`;

const SaveForm: React.FC<{
  open: boolean;
  editingId: number | null;
  miId: number;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ open, editingId, miId, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  /* 编辑回填：平铺字段直接展开 */
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
        colProps={{ span: 8 }} // 统一三列；radio 行同样三列（控件区 ~220px，远大于 radio 组 ~140px 最小宽）
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
              miId,
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

        {/* 行3：编码资质 */}
        <ProFormText
          name="phamStdCode"
          label="药品编码"
          disabled
          rules={[{ required: true, message: '请输入药品编码' }]}
        />
        <ProFormSelect
          name="toxicologyProperty"
          label="毒理分类"
          options={POISON_OPTIONS}
          placeholder="请选择"
          allowClear
        />
        <ProFormText name="qualificationCode" label="批准文件号" />

        {/* 行4：价格包装 */}
        <ProFormDigit
          name="retailPrice"
          label="零售价"
          fieldProps={{ precision: 2 }}
        />
        <ProFormSelect
          name="packageUnit"
          label="零售单位"
          options={UNIT_OPTIONS}
        />
        <ProFormDigit
          name="packageFactor"
          label="包装数量"
          tooltip="零售价包装单位中含有的基本单位数量"
          fieldProps={{ precision: 0 }}
        />

        {/* 行5：单位换算 */}
        <ProFormSelect
          name="phamUnit"
          label="药品单位"
          options={UNIT_OPTIONS}
        />
        <ProFormSelect
          name="doseUnit"
          label="剂量单位（含量）"
          options={UNIT_OPTIONS}
        />
        <ProFormDigit
          name="dosePerUnit"
          label="剂量单位换算系数"
          tooltip="最小单位与剂量单位的换算系数（历史原因 varchar，提交字符串）"
          fieldProps={{ stringMode: true }}
        />

        {/* 行6：编码 */}
        <ProFormText name="billModelCode" label="费用记账方式" />
        <ProFormText name="phamCode" label="院内药品编码" />
        <ProFormText
          name="drugIdentifierCode"
          label="药品标识码"
          tooltip="追溯码前 7 位"
          fieldProps={{ maxLength: 7, showCount: true }}
        />

        {/* 行7：剂型输液 */}
        <ProFormSelect
          name="dosageForm"
          label="剂型"
          options={DOSAGE_FORM_OPTIONS}
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

        {/* 行8：标志组一（radio 三列） */}
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

        {/* 行9：标志组二（radio 三列） */}
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

        {/* 行10：状态与单位 */}
        <ProFormSelect
          name="drugUseStatus"
          label="药品状态"
          options={STATUS_OPTIONS}
        />
        <ProFormSelect
          name="volumeUnit"
          label="体积单位"
          options={VOLUME_UNIT_OPTIONS}
        />
        <ProFormDigit name="qualityUnitDosage" label="质量单位剂量" />

        {/* 行11：剂量与助记 */}
        <ProFormSelect
          name="qualityUnit"
          label="质量单位"
          options={QUALITY_UNIT_OPTIONS}
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

        {/* 药品包装信息：三行固定表格 */}
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
                      <Select
                        placeholder="请选择"
                        options={UNIT_OPTIONS}
                        style={{ width: '100%' }}
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
