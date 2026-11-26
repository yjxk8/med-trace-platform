/**
 * 批量分配角色/部门弹窗(kind 二合一)—— 契约:PUT /user/batch-roles | PUT /user/batch-depts
 * 目标=列表勾选用户(只读 Tag 展示);mode 默认 append(保留每人已有绑定,叠加新选);
 * overwrite=每人绑定统一替换为本次所选(红色警示,不可撤销);
 * 默认角色/部门不在此指定——后端按既有规则处理(追加=保留现状;覆盖=按单条契约)。
 * 4402:麻精关键角色禁止直授(后端整体拦截),提示条前置;跨机构部门目标后端 skipped。
 * 结果:BatchOpResult 部分成功模式 → BatchResultModal 逐条展示(结果弹窗以 sibling 存活,
 * 对齐 CopyPermissionModal 的主弹窗关闭 → 结果弹窗接力模式)。
 */
import { Alert, App, Radio, Select, Space, Spin, Tag, TreeSelect } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import { getDeptTree } from '@/services/org/dept';
import {
  fetchRoleOptions,
  ROLE_TYPE,
  type RoleOptionVO,
} from '@/services/org/role';
import {
  type BatchOpResult,
  batchAssignUserDepts,
  batchAssignUserRoles,
  type UserVO,
} from '@/services/org/user';
import { getOrgId } from '@/utils/orgContext';
import BatchResultModal from './BatchResultModal';

interface Props {
  open: boolean;
  kind: 'role' | 'dept';
  users: UserVO[];
  onClose: () => void;
  onDone: () => void;
}

/** 部门树节点(TreeSelect) */
interface DeptTreeNode {
  title: string;
  value: string;
  children?: DeptTreeNode[];
}

/** 嵌套优先,平铺兜底(parentId 重建;字段兼容 deptId|id / deptName|name|title) */
function buildDeptTreeData(input: any[]): DeptTreeNode[] {
  if (!Array.isArray(input) || input.length === 0) return [];
  const wrap = (
    id: string,
    title: string,
    children: DeptTreeNode[],
  ): DeptTreeNode => ({
    title,
    value: id,
    ...(children.length > 0 ? { children } : {}),
  });
  const walk = (list: any[]): DeptTreeNode[] =>
    (list ?? [])
      .map((n) => {
        const id = String(n?.deptId ?? n?.id ?? '');
        if (!id) return null;
        const children = Array.isArray(n?.children) ? walk(n.children) : [];
        return wrap(
          id,
          String(n?.deptName ?? n?.name ?? n?.title ?? id),
          children,
        );
      })
      .filter((n): n is DeptTreeNode => !!n);
  if (input.some((n) => Array.isArray(n?.children) && n.children.length > 0)) {
    return walk(input);
  }
  // 平铺形态:按 parentId 重建(孤儿挂根)
  const flat = input
    .map((n) => ({
      id: String(n?.deptId ?? n?.id ?? ''),
      title: String(n?.deptName ?? n?.name ?? n?.title ?? ''),
      parentId: n?.parentId != null ? String(n.parentId) : '',
    }))
    .filter((n) => n.id);
  const ids = new Set(flat.map((n) => n.id));
  const byParent = new Map<string, typeof flat>();
  flat.forEach((n) => {
    const k = n.parentId && ids.has(n.parentId) ? n.parentId : '__root__';
    const arr = byParent.get(k) ?? [];
    arr.push(n);
    byParent.set(k, arr);
  });
  const out: DeptTreeNode[] = [];
  const attach = (n: { id: string; title: string }): DeptTreeNode =>
    wrap(
      n.id,
      n.title,
      (byParent.get(n.id) ?? []).map((c) => attach(c)),
    );
  (byParent.get('__root__') ?? []).forEach((n) => {
    out.push(attach(n));
  });
  return out;
}

export default function BatchAssignModal({
  open,
  kind,
  users,
  onClose,
  onDone,
}: Props) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'append' | 'overwrite'>('append');
  const [roleOpts, setRoleOpts] = useState<RoleOptionVO[]>([]);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [deptTree, setDeptTree] = useState<DeptTreeNode[]>([]);
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [result, setResult] = useState<BatchOpResult | null>(null);

  const isRole = kind === 'role';
  const kindLabel = isRole ? '角色' : '部门';

  // 打开:拉候选(角色=分组下拉数据源;部门=当前机构树;目标全为列表机构内用户,机构锁定一致)
  useEffect(() => {
    if (!open || users.length === 0) return;
    setMode('append');
    setRoleIds([]);
    setDeptIds([]);
    setRoleOpts([]);
    setDeptTree([]);
    setResult(null);
    setLoading(true);
    const load = isRole
      ? fetchRoleOptions().then(setRoleOpts)
      : (() => {
          const cur = getOrgId();
          const miId =
            cur != null && Number(cur) > 0
              ? Number(cur)
              : Number(users[0]?.miId ?? 0);
          if (!miId) return Promise.resolve();
          return getDeptTree({ miId }).then((t) =>
            setDeptTree(buildDeptTreeData(Array.isArray(t) ? t : [])),
          );
        })();
    load
      .catch((e) => {
        console.warn('[BatchAssignModal] 候选加载失败:', e);
      })
      .finally(() => setLoading(false));
  }, [open, kind, users]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 角色按 roleType 分组下拉(平台/医院/区域 + 其他兜底,对齐单人弹窗分组口径) */
  const roleGroupedOptions = useMemo(() => {
    const known = [
      { key: String(ROLE_TYPE.PLATFORM), label: '平台角色' },
      { key: String(ROLE_TYPE.HOSPITAL), label: '医院角色' },
      { key: String(ROLE_TYPE.REGION), label: '区域角色' },
    ];
    const mapOpt = (o: RoleOptionVO) => ({
      label: `${o.name}（${o.code}）`,
      value: Number(o.id),
    });
    const groups = known
      .map((g) => ({
        label: g.label,
        title: g.label,
        options: roleOpts
          .filter((o) => String(o.roleType) === g.key)
          .map(mapOpt),
      }))
      .filter((g) => g.options.length > 0);
    const others = roleOpts
      .filter((o) => !known.some((k) => k.key === String(o.roleType)))
      .map(mapOpt);
    if (others.length > 0) {
      groups.push({ label: '其他角色', title: '其他角色', options: others });
    }
    return groups;
  }, [roleOpts]);

  const selectedCount = isRole ? roleIds.length : deptIds.length;

  const doSave = async () => {
    if (users.length === 0 || selectedCount === 0) return;
    setSaving(true);
    try {
      const userIds = users.map((u) => Number(u.id));
      const res = isRole
        ? await batchAssignUserRoles({ userIds, roleIds, mode })
        : await batchAssignUserDepts({
            userIds,
            deptIds: deptIds.map(Number),
            mode,
          });
      onClose(); // 主弹窗关;结果弹窗以 sibling 存活(对齐 CopyPermissionModal)
      setResult(res);
    } catch (e) {
      message.error((e as Error).message);
      throw e; // 保持弹窗开启(既有约定)
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DraggableModal
        title={`批量分配${kindLabel}（${users.length} 人）`}
        open={open}
        onOk={doSave}
        confirmLoading={saving}
        okButtonProps={{ disabled: selectedCount === 0 }}
        okText="提交"
        onCancel={onClose}
        destroyOnClose
        width={680}
        centered
        styles={{
          body: { maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' },
        }}
      >
        {/* 1. 目标用户(只读,来自列表勾选) */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            目标用户（{users.length}）
          </div>
          <Space size={[4, 4]} wrap>
            {users.map((u) => (
              <Tag key={String(u.id)} color="blue">
                {u.name}（{u.account}）
              </Tag>
            ))}
          </Space>
        </div>

        {/* 2. 分配方式(append 默认;overwrite 红色警示) */}
        <div style={{ fontWeight: 600, marginBottom: 8 }}>分配方式</div>
        <Radio.Group
          value={mode}
          onChange={(e) => setMode(e.target.value as 'append' | 'overwrite')}
          style={{ marginBottom: 8 }}
        >
          <Radio value="append">追加授权（推荐）</Radio>
          <Radio value="overwrite">全量覆盖</Radio>
        </Radio.Group>
        <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>
          {mode === 'append'
            ? `保留每人已有${kindLabel}，在其基础上叠加本次所选。`
            : `每人${kindLabel}绑定将统一替换为本次所选，各自已有差异将被移除。`}
        </div>
        {mode === 'overwrite' && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 8 }}
            message={`全量覆盖不可撤销：未选中的${kindLabel}将被解除绑定。`}
          />
        )}
        {isRole && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 8 }}
            message="麻精关键权限角色禁止直接授权（后端整体拦截）；如需授予请走用户组授权通道。"
          />
        )}

        {/* 3. 候选选择(角色=分组多选下拉;部门=树勾选,SHOW_CHILD 级联) */}
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          选择{kindLabel}
          <span
            style={{
              fontWeight: 400,
              color: '#8c8c8c',
              fontSize: 12,
              marginLeft: 8,
            }}
          >
            已选 {selectedCount} 项
          </span>
        </div>
        <Spin spinning={loading}>
          {isRole ? (
            <Select
              mode="multiple"
              showSearch
              allowClear
              optionFilterProp="label"
              style={{ width: '100%' }}
              placeholder="按类型分组搜索并选择角色"
              value={roleIds}
              options={roleGroupedOptions}
              onChange={(v) => setRoleIds(v as number[])}
            />
          ) : (
            <TreeSelect
              multiple
              showSearch
              allowClear
              treeCheckable
              showCheckedStrategy={TreeSelect.SHOW_CHILD}
              treeData={deptTree}
              value={deptIds}
              onChange={(v) => setDeptIds(v as string[])}
              style={{ width: '100%' }}
              placeholder="选择部门（勾选上级将包含其全部下级）"
              maxTagCount={8}
              treeNodeFilterProp="title"
            />
          )}
        </Spin>
        <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
          默认{isRole ? '角色' : '部门'}
          本次不指定：追加模式保留各用户现状；覆盖模式由后端按单条分配契约处理。跨机构部门目标将被跳过并在结果中说明。
        </div>
      </DraggableModal>

      {/* 结果弹窗(sibling 位置,主弹窗 destroyOnClose 不影响其存活) */}
      <BatchResultModal
        open={!!result}
        title={`批量分配${kindLabel}结果`}
        result={result}
        onClose={() => {
          setResult(null);
          onDone();
        }}
      />
    </>
  );
}
