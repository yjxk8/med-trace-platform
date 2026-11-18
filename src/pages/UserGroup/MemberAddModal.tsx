/**
 * 批量加入成员 —— 方案 §4.3（v2：接入双栏选择器）
 * v2 变更（仅成员选择交互，提交契约不变）：
 * - 选择成员由「/user/options 一次拉取 + Select 本地过滤」改为 UserBatchPicker
 *   （分页接口服务端检索 + 左右双栏）——根治选项截断搜不到人、多选操作繁琐【反馈⑧】；
 * - picked 状态在 Form 之外由本组件维护，提交时取 picked.map(u => u.id) 为 userIds；
 * 其余逻辑原样保留：≤200 硬拦；成员时效不传=跟随组；validTo ≤ 组.validTo 前端预检；
 * 麻精组 → Modal.confirm 二次确认（风险留痕文案）；回执三态：direct=Result+skipped 明细
 * （正常回执非错误）；confirm=合规确认单 Alert；请求级失败=全局 toast。
 * ★M1：doSubmit 补 setSaving——原先从未置位，confirmLoading 恒 false，可双击重复提交。
 */

import { history } from '@umijs/max';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Form,
  Modal,
  Result,
  Space,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import {
  type BatchAddResultVO,
  batchAddMembers,
  FMT_DATETIME,
  NARCOTIC,
  type UserGroupVO,
} from '@/services/org/userGroup';
import UserBatchPicker, { type PickedUser } from './UserBatchPicker';

interface Props {
  open: boolean;
  group: UserGroupVO | null;
  onClose: () => void;
  onAdded: () => void;
}

const MAX_ADD = 200;

export default function MemberAddModal({
  open,
  group,
  onClose,
  onAdded,
}: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<PickedUser[]>([]);
  const [result, setResult] = useState<BatchAddResultVO | null>(null);
  const miId = group ? Number(group.miId) : 0;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setPicked([]);
    setResult(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSubmit = async (v: { validFrom?: Dayjs; validTo?: Dayjs }) => {
    if (!group) return;
    setSaving(true); // ★M1
    try {
      const res = await batchAddMembers(group.id, {
        userIds: picked.map((u) => u.id),
        validFrom: v.validFrom ? v.validFrom.format(FMT_DATETIME) : undefined,
        validTo: v.validTo ? v.validTo.format(FMT_DATETIME) : undefined,
      });
      setResult(res);
      onAdded(); // Drawer 立即刷新成员列表
    } finally {
      setSaving(false); // ★M1
    }
  };

  const submit = async () => {
    if (!group) return;
    if (picked.length === 0) {
      message.warning('请先在左侧勾选成员并点「加入」');
      return;
    }
    if (picked.length > MAX_ADD) {
      message.warning(`单次最多加入 ${MAX_ADD} 人`);
      return;
    }
    const v = await form.validateFields();
    const run = async () => {
      try {
        await doSubmit(v);
      } catch (e) {
        message.error((e as Error).message);
        throw e;
      }
    };
    // 麻精敏感组：提交前二次确认（方案 §4.3；P0 前端确认仅为 UX 提示，非合规防线）
    if (String(group.isNarcoticGroup) === NARCOTIC.YES) {
      Modal.confirm({
        title: '麻精敏感组确认',
        content: `即将向麻精敏感组「${group.groupName}」加入 ${picked.length} 名成员；成员资质已预检，操作将留痕。是否继续？`,
        okText: '确认加入',
        okButtonProps: { danger: true },
        onOk: run,
      });
    } else {
      await run();
    }
  };

  return (
    <DraggableModal
      title={`批量加入成员${group ? ` · ${group.groupName}` : ''}`}
      open={open}
      onOk={result ? undefined : submit}
      confirmLoading={saving} // ★M1 现在真实生效
      onCancel={onClose}
      destroyOnHidden
      width={880}
      okText={
        result
          ? undefined
          : `提交${picked.length ? `（${picked.length} 人）` : ''}`
      }
      footer={result ? null : undefined}
    >
      {result ? (
        result.mode === 'confirm' ? (
          <Alert
            type="warning"
            showIcon
            message={`已生成合规确认单 #${result.confirmId ?? '-'}，待合规审批后生效，本次未变更`}
            description={
              <>
                审批入口见「合规确认待办」，审批通过后生效，本次未变更。
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0 }}
                  onClick={() => history.push('/org/compliance/confirm')}
                >
                  前往确认待办
                </Button>
              </>
            }
          />
        ) : (
          <Result
            status="success"
            title={`已加入 ${result.added} 名成员`}
            subTitle={
              result.skipped?.length
                ? `其中 ${result.skipped.length} 人被跳过（明细如下）`
                : undefined
            }
            extra={
              <Space>
                <Button
                  onClick={() => {
                    setResult(null);
                    setPicked([]);
                    form.resetFields();
                  }}
                >
                  继续添加
                </Button>
                <Button type="primary" onClick={onClose}>
                  关闭
                </Button>
              </Space>
            }
          >
            {result.skipped?.length ? (
              <div
                style={{ maxHeight: 220, overflowY: 'auto', textAlign: 'left' }}
              >
                {result.skipped.map((s) => (
                  <div
                    key={s.userId}
                    style={{
                      padding: '4px 0',
                      borderBottom: '1px solid #f0f0f0',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: '#8c8c8c' }}>userId={s.userId}</span>
                    ：{s.reason}
                  </div>
                ))}
              </div>
            ) : null}
          </Result>
        )
      ) : (
        <>
          <UserBatchPicker
            miId={miId}
            max={MAX_ADD}
            value={picked}
            onChange={setPicked}
          />
          <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
            <Form.Item
              label="成员时效"
              style={{ marginBottom: 0 }}
              extra="不填 = 跟随组有效期；已提交过的账号后端将跳过并逐行展示原因"
            >
              <Space style={{ display: 'flex' }}>
                <Form.Item name="validFrom" noStyle>
                  <DatePicker
                    showTime
                    style={{ width: 220 }}
                    placeholder="生效时间"
                  />
                </Form.Item>
                <Form.Item
                  name="validTo"
                  noStyle
                  dependencies={['validFrom']}
                  rules={[
                    ({ getFieldValue }) => ({
                      validator(_, v: Dayjs | null | undefined) {
                        const s = getFieldValue('validFrom') as
                          | Dayjs
                          | undefined
                          | null;
                        if (v && s && v.isBefore(s))
                          return Promise.reject(
                            new Error('失效时间不能早于生效时间'),
                          );
                        // 前端预检：成员失效时间 ≤ 组失效日期（当日 23:59:59）
                        const gv = group?.validTo
                          ? dayjs(group.validTo).endOf('day')
                          : null;
                        if (v && gv && v.isAfter(gv))
                          return Promise.reject(
                            new Error(
                              `成员失效时间不能晚于用户组有效期（${group?.validTo}）`,
                            ),
                          );
                        return Promise.resolve();
                      },
                    }),
                  ]}
                >
                  <DatePicker
                    showTime
                    style={{ width: 220 }}
                    placeholder="失效时间"
                  />
                </Form.Item>
              </Space>
            </Form.Item>
          </Form>
        </>
      )}
    </DraggableModal>
  );
}
