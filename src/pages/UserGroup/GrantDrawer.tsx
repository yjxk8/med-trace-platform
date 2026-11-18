/**
 * 组授权绑定 Drawer（v1.2 解封④）—— 契约 §5.1 接口10/11 / §7.2
 * 形态：顶部新增行区（角色远程搜索 + 时效 yyyy-MM-dd）+ 绑定清单表（行内时效编辑/移除）
 * 提交 = 全量软同步：grants 三态（[]=清空/null报错/非空覆盖）；⚠️ 不过 cleanPayload
 * 双模式渲染（§7.2）：confirmRequired=true → 本次无变更，Alert+跳确认待办；
 *   false → toast「新增a 移除r 调整u」+ 刷新
 * 本地预检：麻精组 → 所有行 validTo 必填（4202 前置）；validTo ≤ 组.validTo；
 *   ⚠️ 关键角色无法本地识别（fetchRoleOptions 无 critical【待确认③】）→ 后端 4202 兜底
 * 已删角色回显行（roleDelFlag=2）：时效锁定不可编辑、可移除；提交时排除
 *   （后端 4203 不接受已删 targetId → 保存后该绑定被解除，清单中显式提示）【反馈⑬】
 */
import { PlusOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Drawer,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { fetchRoleOptions, type RoleOptionVO } from '@/services/org/role';
import {
  fetchGroupGrants,
  type GrantItem,
  type GrantVO,
  syncGroupGrants,
  type UserGroupVO,
} from '@/services/org/userGroup';
import { renderGrantStatus, renderNarcotic, renderRoleDeleted } from './shared';

interface Props {
  open: boolean;
  group: UserGroupVO | null;
  onClose: () => void;
}

/** 清单行（回显行 + 新增行统一形态） */
interface RowItem {
  targetId: number;
  roleName: string;
  roleDelFlag: number | null;
  grantStatus: number | string | null; // null = 新增未提交
  validFrom: string | null;
  validTo: string | null;
}

const toD = (v: string | null) => (v && dayjs(v).isValid() ? dayjs(v) : null);
const fmtD = (d: Dayjs | null) => (d ? d.format('YYYY-MM-DD') : undefined);

export default function GrantDrawer({ open, group, onClose }: Props) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<RowItem[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOptionVO[]>([]);
  const [pickRoleId, setPickRoleId] = useState<number | undefined>();
  const [pickFrom, setPickFrom] = useState<Dayjs | null>(null);
  const [pickTo, setPickTo] = useState<Dayjs | null>(null);
  const [confirmInfo, setConfirmInfo] = useState<number | null>(null);

  const isNarcotic = !!group && String(group.isNarcoticGroup) === '1';
  const groupValidTo =
    group?.validTo && dayjs(group.validTo).isValid()
      ? dayjs(group.validTo)
      : null;

  // 打开：回显绑定（1+2）+ 角色候选（仅正常角色，limit 50）
  useEffect(() => {
    if (!open || !group?.id) return;
    setRows([]);
    setConfirmInfo(null);
    setPickRoleId(undefined);
    setPickFrom(null);
    setPickTo(null);
    setLoading(true);
    fetchGroupGrants(group.id)
      .then((list) =>
        setRows(
          (list ?? []).map((g: GrantVO) => ({
            targetId: g.targetId,
            roleName: g.roleName ?? `#${g.targetId}`,
            roleDelFlag: g.roleDelFlag,
            grantStatus: g.grantStatus,
            validFrom: g.validFrom,
            validTo: g.validTo,
          })),
        ),
      )
      .catch((e) => message.error((e as Error).message))
      .finally(() => setLoading(false));
    fetchRoleOptions()
      .then(setRoleOptions)
      .catch(() => setRoleOptions([]));
  }, [open, group?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchRoles = (kw?: string) => {
    fetchRoleOptions(kw)
      .then(setRoleOptions)
      .catch(() => {});
  };

  const addRow = () => {
    if (!group?.id || pickRoleId == null) {
      message.warning('请先选择角色');
      return;
    }
    if (rows.some((r) => r.targetId === pickRoleId)) {
      message.warning('该角色已在清单中');
      return;
    }
    const role = roleOptions.find((o) => o.id === pickRoleId);
    setRows((prev) => [
      ...prev,
      {
        targetId: pickRoleId,
        roleName: role?.name ?? `#${pickRoleId}`,
        roleDelFlag: 1,
        grantStatus: null,
        validFrom: fmtD(pickFrom) ?? null,
        validTo: fmtD(pickTo) ?? null,
      },
    ]);
    setPickRoleId(undefined);
  };

  const patchRow = (targetId: number, patch: Partial<RowItem>) => {
    setRows((prev) =>
      prev.map((r) => (r.targetId === targetId ? { ...r, ...patch } : r)),
    );
  };

  /** 提交前本地预检（§7.2）；返回待提交清单（已删角色行排除） */
  const buildPayload = (): GrantItem[] | null => {
    const rowsToSubmit = rows.filter((r) => String(r.roleDelFlag ?? 1) !== '2');
    for (const r of rowsToSubmit) {
      const to = toD(r.validTo);
      const from = toD(r.validFrom);
      if (isNarcotic && !to) {
        message.warning(`麻精敏感组：角色「${r.roleName}」必须填写失效日期`);
        return null;
      }
      if (to && from && to.isBefore(from, 'day')) {
        message.warning(`角色「${r.roleName}」失效日期不能早于生效日期`);
        return null;
      }
      if (to && groupValidTo && to.isAfter(groupValidTo, 'day')) {
        message.warning(
          `角色「${r.roleName}」失效日期不能晚于用户组有效期（${group?.validTo}）`,
        );
        return null;
      }
    }
    return rowsToSubmit.map((r) => ({
      targetId: r.targetId,
      validFrom: r.validFrom ?? undefined,
      validTo: r.validTo ?? undefined,
    }));
  };

  const doSave = async () => {
    if (!group?.id) return;
    const grants = buildPayload();
    if (grants == null) return;
    setSaving(true);
    try {
      const res = await syncGroupGrants(group.id, grants);
      if (res?.confirmRequired) {
        // 转合规确认单：本次库内无变更，清单回滚为回显态
        setConfirmInfo(res.confirmId);
        message.info('已生成合规确认单，审批通过后生效');
      } else {
        setConfirmInfo(null);
        message.success(
          `已同步：新增 ${res?.added ?? 0} 移除 ${res?.removed ?? 0} 调整 ${res?.updated ?? 0}`,
        );
      }
      const list = await fetchGroupGrants(group.id);
      setRows(
        (list ?? []).map((g: GrantVO) => ({
          targetId: g.targetId,
          roleName: g.roleName ?? `#${g.targetId}`,
          roleDelFlag: g.roleDelFlag,
          grantStatus: g.grantStatus,
          validFrom: g.validFrom,
          validTo: g.validTo,
        })),
      );
    } catch (e) {
      message.error((e as Error).message); // 4202/4203/4204 等原文
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!group?.id) return;
    const grants = buildPayload();
    if (grants == null) return;
    if (
      grants.length === 0 &&
      rows.some((r) => String(r.roleDelFlag ?? 1) !== '2')
    ) {
      // 全量清单为空 = 清空授权（三态 []）
      Modal.confirm({
        title: '清空该组的全部授权绑定？',
        content: 'grants=[] 为清空语义，保存后该组全部角色授权将被解除。',
        okText: '确认清空',
        okButtonProps: { danger: true },
        onOk: doSave,
      });
      return;
    }
    Modal.confirm({
      title: '保存组授权绑定？',
      content: `全量软同步：保存后该组共绑定 ${grants.length} 个角色${isNarcotic || rows.some((r) => r.validTo) ? '（含时效）' : ''}，未保留的绑定将被解除。${
        isNarcotic ? '麻精敏感组的绑定将转入合规确认流程。' : ''
      }`,
      okText: '保存',
      onOk: doSave,
    });
  };

  const columns = [
    {
      title: '角色',
      dataIndex: 'roleName',
      width: 220,
      render: (_: unknown, r: RowItem) => (
        <Space size={4}>
          <span>{r.roleName}</span>
          {renderRoleDeleted(r.roleDelFlag)}
          {r.grantStatus == null && <Tag color="blue">待提交</Tag>}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'grantStatus',
      width: 90,
      render: (_: unknown, r: RowItem) =>
        r.grantStatus == null ? '-' : renderGrantStatus(r.grantStatus),
    },
    {
      title: '生效日期',
      width: 140,
      render: (_: unknown, r: RowItem) => {
        const locked = String(r.roleDelFlag ?? 1) === '2';
        return (
          <DatePicker
            size="small"
            style={{ width: '100%' }}
            disabled={locked}
            value={toD(r.validFrom)}
            onChange={(d) =>
              patchRow(r.targetId, { validFrom: fmtD(d) ?? null })
            }
          />
        );
      },
    },
    {
      title: '失效日期',
      width: 140,
      render: (_: unknown, r: RowItem) => {
        const locked = String(r.roleDelFlag ?? 1) === '2';
        return (
          <DatePicker
            size="small"
            style={{ width: '100%' }}
            disabled={locked}
            value={toD(r.validTo)}
            onChange={(d) => patchRow(r.targetId, { validTo: fmtD(d) ?? null })}
          />
        );
      },
    },
    {
      title: '操作',
      width: 70,
      render: (_: unknown, r: RowItem) => (
        <Button
          type="link"
          size="small"
          danger
          style={{ padding: 0 }}
          onClick={() =>
            setRows((prev) => prev.filter((x) => x.targetId !== r.targetId))
          }
        >
          移除
        </Button>
      ),
    },
  ];

  return (
    <Drawer
      title={
        group ? (
          <Space size={8} wrap>
            <span>绑定授权：{group.groupName}</span>
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              {group.groupCode}
            </span>
            {renderNarcotic(group.isNarcoticGroup)}
          </Space>
        ) : (
          '绑定授权'
        )
      }
      open={open}
      onClose={onClose}
      size={880}
      destroyOnHidden
      extra={
        <Button type="primary" loading={saving} onClick={handleSave}>
          保存（全量同步）
        </Button>
      }
    >
      {confirmInfo != null && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`已生成合规确认单 #${confirmInfo}，审批通过后生效，本次未变更`}
          action={
            <Button
              size="small"
              type="link"
              onClick={() => history.push('/org/compliance/confirm')}
            >
              前往确认待办
            </Button>
          }
        />
      )}
      {isNarcotic && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message="麻精敏感组：所有绑定必须设置失效日期；保存将转入合规确认流程（双人复核）"
        />
      )}
      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          showSearch
          style={{ width: 260 }}
          placeholder="搜索并选择角色（仅正常角色）"
          value={pickRoleId}
          options={roleOptions.map((o) => ({
            value: o.id,
            label: `${o.name}（${o.code}）`,
          }))}
          onSearch={searchRoles}
          filterOption={false}
          onChange={(v) => setPickRoleId(v)}
          notFoundContent="无匹配角色"
        />
        <DatePicker
          placeholder="生效日期"
          value={pickFrom}
          onChange={setPickFrom}
        />
        <DatePicker
          placeholder="失效日期"
          value={pickTo}
          onChange={setPickTo}
        />
        <Button icon={<PlusOutlined />} onClick={addRow}>
          添加到清单
        </Button>
      </Space>
      <Table
        rowKey={(r: RowItem) => String(r.targetId)}
        size="small"
        loading={loading}
        columns={columns as never}
        dataSource={rows}
        pagination={false}
        scroll={{ y: 420 }}
        locale={{ emptyText: '暂无绑定；添加角色后保存即生效' }}
      />
      <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
        保存为全量软同步：提交当前清单（未保留的绑定将被解除）；已删角色的历史绑定保存后自动解除；
        不传时效 = 跟随组有效期由后端处理。
      </div>
    </Drawer>
  );
}
