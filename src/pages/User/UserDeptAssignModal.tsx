/**
 * 用户-部门分配弹窗（左树右已选面板）—— 契约：UserController GET/PUT /user/{id}/depts
 * 形态对齐 UserRoleAssignModal：左=部门树勾选（级联），右=已选实时汇总；复用 ./index.less 样式。
 *
 * 契约红线：
 * ① 部门为层级树（parentId），无类型分组；勾父级联全选子部门（checkStrictly=false，对齐角色弹窗交互）；
 *    ⚠️ 级联语义：回显的「父部门」会被级联为其全部子部门（全量覆盖口径下保存会把子部门一并绑定，
 *    即「勾父=授权整棵子树」）；若产品要求父子独立勾选，把 Tree 的 checkStrictly 改 true 即可（单行切换）；
 * ② deptIds 三态：[]=清空 / null=报错（service 严禁过 cleanPayload，user.ts 已保证）；
 * ③ 回显项自带 deptName → 不在候选树内的历史绑定直接用回显名建「历史绑定」组
 *    （免反查，对齐角色 preserved 兜底思想；移除标签=主动解绑）；
 * ④ defaultDeptId 仅透传不设 UI：回显 isDefault=1 且仍被勾选时原样带上，
 *    防止覆盖保存抹掉默认标记（对齐角色弹窗 defaultRoleId 口径）；
 * ⑤ 未变更不提交（基线=回显部门集合）；覆盖确认含摘要；失败 throw 保持确认框开启；
 * ⑥ 树内已停用部门：名称旁标「已停用」，仍可勾选/取消（绑定合法性由后端校验）。
 *
 * ★2026-11-17 修复：
 * ⑦ 弹窗尺寸固定：左右两框固定高（BOX_H，只随视口变化），搜索过滤/勾选数量变化不再撑缩弹窗，
 *    滚动收敛到框内部（此前 body 内容自适应，输入搜索词弹窗高度跳动）；
 * ⑧ 搜索态勾选安全：antd Tree onCheck 只按「当前渲染树」重算 checkedKeys，被搜索隐藏的
 *    已勾选节点会被丢弃 → handleCheck 三步合并：隐藏保留 + 新勾父级隐藏后代补齐 + 取消父级隐藏后代裁剪。
 *
 * ★2026-11-18 biome 修复：
 * ⑨ forEach 箭头体一律加花括号（useIterableCallbackReturn：Set.add/Map.set 有返回值，
 *    裸表达式箭头被视为隐式返回，共 3 处 5 个诊断）；
 * ⑩ 树节点 title 的 span 补 key（useJsxKeyInIterable，key 用节点自身唯一标识 n.id）。
 *
 * ★数据源对齐点（全文件仅 loadDeptTree / normalizeDepts 两处依赖 dept 模块形状，
 * dept 模块接口/字段怎么变，只改这两个函数）：
 */
import {
  App,
  Button,
  Empty,
  Input,
  Modal,
  Spin,
  Tag,
  Tooltip,
  Tree,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { Key, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
// ★对齐点（dept 模块真实契约）：导出名 getDeptTree，miId 契约必传
import { getDeptTree } from '@/services/org/dept';
import {
  assignUserDepts,
  fetchUserDepts,
  type UserDeptItem,
  type UserVO,
} from '@/services/org/user';
import { getMiIdRequired } from '@/services/tenant';
import { getOrgId } from '@/utils/orgContext';
import './index.less';

interface Props {
  open: boolean;
  /** null = 不展示 */
  user: UserVO | null;
  onClose: () => void;
  onSaved: () => void;
}

/** 历史绑定项：回显 deptId 不在候选树内（部门已删除/跨机构不可见） */
interface PreservedItem {
  id: number;
  name: string;
}

/**
 * 候选部门归一化中间态
 * （字段名兼容：deptId|id、deptName|name|title、deptStatus|status）
 */
interface DeptFlat {
  id: string;
  name: string;
  parentId: string | null;
  disabled: boolean;
}

interface SelectedGroupView {
  key: 'tree' | 'preserved';
  label: string;
  color: string;
  items: { id: string; name: string }[];
}

// ===== dept 数据源（★对齐点：getDeptTree miId 契约必传）=====

/**
 * 拉取候选部门：★登录所选机构优先——列表已按机构过滤，行用户必属当前机构；
 * user.miId 仅兜底（防历史脏数据行/上下文缺失）；切机构后打开弹窗必拿新机构树
 */
async function loadDeptTree(user: UserVO | null): Promise<any[]> {
  const cur = getOrgId();
  const uid = Number(user?.miId);
  const miId =
    cur != null && Number(cur) > 0
      ? Number(cur)
      : Number.isFinite(uid) && uid > 0
        ? uid
        : getMiIdRequired();
  // 不传 deptStatus → 全量树（含停用部门，树内由 normalizeDepts 标「已停用」，仍可勾选/解绑）
  const tree = await getDeptTree({ miId });
  return Array.isArray(tree) ? tree : [];
}

/** 树/平铺双形态 → 归一化平铺（parentId 解析为树内引用，孤儿挂根） */
function normalizeDepts(input: any[]): DeptFlat[] {
  if (!Array.isArray(input) || input.length === 0) return [];
  const hasNested = input.some(
    (n) => Array.isArray(n?.children) && n.children.length > 0,
  );
  if (hasNested) {
    const out: DeptFlat[] = [];
    const walk = (list: any[], parentId: string | null) => {
      (list ?? []).forEach((n) => {
        const id = String(n?.deptId ?? n?.id ?? '');
        if (!id) return;
        out.push({
          id,
          name: String(n?.deptName ?? n?.name ?? n?.title ?? ''),
          parentId,
          disabled: String(n?.deptStatus ?? n?.status ?? '1') !== '1',
        });
        if (Array.isArray(n?.children)) walk(n.children, id);
      });
    };
    walk(input, null);
    if (out.length >= input.length) return out; // 树遍历覆盖全部顶层节点才采用
  }
  // 平铺形态（或树遍历异常）：按 parentId 重建
  const flat = input
    .map((n) => ({
      id: String(n?.deptId ?? n?.id ?? ''),
      name: String(n?.deptName ?? n?.name ?? n?.title ?? ''),
      parentId: n?.parentId != null ? String(n.parentId) : null,
      disabled: String(n?.deptStatus ?? n?.status ?? '1') !== '1',
    }))
    .filter((n) => n.id);
  const ids = new Set(flat.map((n) => n.id));
  const byParent = new Map<string, DeptFlat[]>();
  flat.forEach((n) => {
    const key =
      n.parentId != null && ids.has(n.parentId) ? n.parentId : '__root__';
    const arr = byParent.get(key) ?? [];
    arr.push(n);
    byParent.set(key, arr);
  });
  const out: DeptFlat[] = [];
  const build = (pid: string) => {
    (byParent.get(pid) ?? []).forEach((n) => {
      out.push(n);
      build(n.id);
    });
  };
  build('__root__');
  return out;
}

/** 归一化平铺 → antd DataNode 树；可搜索文本（name）写入 textMap */
function buildDeptTree(
  flat: DeptFlat[],
  textMap: Map<string, string>,
): DataNode[] {
  const byParent = new Map<string | null, DeptFlat[]>();
  flat.forEach((n) => {
    const key =
      n.parentId != null && flat.some((x) => x.id === n.parentId)
        ? n.parentId
        : null;
    const arr = byParent.get(key) ?? [];
    arr.push(n);
    byParent.set(key, arr);
  });
  const build = (pid: string | null): DataNode[] =>
    (byParent.get(pid) ?? []).map((n) => {
      textMap.set(n.id, n.name.toLowerCase());
      const children = build(n.id);
      // ★修复⑩：span 补 key（useJsxKeyInIterable；n.id 为节点唯一标识）
      const title: ReactNode = (
        <span key={n.id} className="user-role-node">
          <span className="user-role-node__name">{n.name}</span>
          {n.disabled && <span className="user-role-node__code">已停用</span>}
        </span>
      );
      return children.length
        ? { key: n.id, title, children }
        : { key: n.id, title };
    });
  return build(null);
}

/** 全部节点 key（展开全部/搜索态自动展开用） */
function collectAllKeys(nodes: DataNode[], acc: Key[] = []): Key[] {
  nodes.forEach((n) => {
    acc.push(n.key);
    if (n.children?.length) collectAllKeys(n.children, acc);
  });
  return acc;
}

// ★2026-11-17 修复⑦：双栏固定高度（只随视口变化，不随搜索/勾选数量变化）
const BOX_H = 'min(520px, calc(100vh - 420px))';

/**
 * ★2026-11-17 修复⑧辅助：全量树中 key 节点的全部后代 id（任意层级，String 数组）。
 * 搜索过滤态下 antd 的级联只作用于「可见树」；勾/取消父级时用它把
 * 被搜索隐藏的后代一并补齐/裁剪，保证「勾父=全选子树」不因过滤而残缺。
 */
function collectDescendantIds(tree: DataNode[], key: string): string[] {
  const out: string[] = [];
  const collect = (n: DataNode) => {
    (n.children ?? []).forEach((c) => {
      out.push(String(c.key));
      collect(c);
    });
  };
  const walk = (nodes: DataNode[]): boolean => {
    for (const n of nodes) {
      if (String(n.key) === key) {
        collect(n);
        return true;
      }
      if (n.children?.length && walk(n.children)) return true;
    }
    return false;
  };
  walk(tree);
  return out;
}

/** 树内搜索：命中（自身文本或子孙命中）保留（对齐 AssignMenuModal/UserRoleAssignModal） */
function filterTreeNodes(
  nodes: DataNode[],
  kw: string,
  textMap: Map<string, string>,
): DataNode[] {
  const res: DataNode[] = [];
  nodes.forEach((n) => {
    const selfHit = (textMap.get(String(n.key)) ?? '').includes(kw);
    const childHit = n.children?.length
      ? filterTreeNodes(n.children, kw, textMap)
      : [];
    if (selfHit || childHit.length) {
      res.push({ ...n, children: selfHit ? n.children : childHit });
    }
  });
  return res;
}

export default function UserDeptAssignModal({
  open,
  user,
  onClose,
  onSaved,
}: Props) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<Key[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);
  const [preserved, setPreserved] = useState<PreservedItem[]>([]);
  const [keyword, setKeyword] = useState('');
  /** 回显的默认部门（无 UI，只透传；见文件头④） */
  const defaultDeptIdRef = useRef<number | undefined>(undefined);
  /** 节点可搜索文本（key → 小写文本） */
  const searchTextRef = useRef<Map<string, string>>(new Map());
  /** 树内全部真实部门 id（提交/回显边界；部门树全为真实 id，无分组 key） */
  const allIdsRef = useRef<Set<string>>(new Set());
  /** 归一化平铺（右侧已选面板名称来源） */
  const flatRef = useRef<DeptFlat[]>([]);
  /** 打开时的基线（回显部门集合），isChanged 比对用 */
  const baselineIdsRef = useRef<Set<string>>(new Set());

  const kw = keyword.trim().toLowerCase();
  const filteredTree = useMemo(
    () =>
      kw ? filterTreeNodes(treeData, kw, searchTextRef.current) : treeData,
    [treeData, kw], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const displayExpanded = useMemo<Key[]>(
    () => (kw ? collectAllKeys(filteredTree) : expandedKeys),
    [kw, filteredTree, expandedKeys],
  );

  /**
   * ★2026-11-17 修复⑧：勾选处理（搜索过滤态安全）
   * antd Tree 的 onCheck 只按「当前渲染树」重算 checkedKeys——被搜索隐藏的
   * 已勾选节点会被直接丢弃（右侧已选面板随之丢项）。三步：
   * ① 隐藏保留：不在当前渲染树内的旧勾选原样保留；
   * ② 级联补齐：新勾选的父级，其隐藏后代一并入选（勾父=全选子树，含隐藏部分）；
   * ③ 级联裁剪：取消勾选的父级，其隐藏后代一并移除（对齐未过滤时的级联语义）。
   * ★修复⑨：incoming/added/removed 的 forEach 箭头体加花括号（Set.add 有返回值）
   */
  const handleCheck = (
    checked: Key[] | { checked: Key[]; halfChecked: Key[] },
  ) => {
    if (!Array.isArray(checked)) return;
    const visible = new Set(collectAllKeys(filteredTree).map(String));
    const incoming = new Set(checked.map(String));
    const prev = new Set(checkedKeys.map(String));
    const merged = new Set<string>();
    prev.forEach((k) => {
      if (!visible.has(k)) merged.add(k); // ① 隐藏项保留
    });
    // ★修复⑨：花括号（消原 301）
    incoming.forEach((k) => {
      merged.add(k); // 可见树的重算结果原样采用
    });
    const added = [...incoming].filter((k) => !prev.has(k));
    const removed = [...prev].filter((k) => visible.has(k) && !incoming.has(k));
    // ★修复⑨：内外两层都要花括号（消原 304/305）
    added.forEach((k) => {
      collectDescendantIds(treeData, k).forEach((d) => {
        merged.add(d);
      });
    }); // ② 补齐隐藏后代
    // ★修复⑨：内外两层都要花括号（消原 307/308）
    removed.forEach((k) => {
      collectDescendantIds(treeData, k).forEach((d) => {
        merged.delete(d);
      });
    }); // ③ 裁剪隐藏后代
    setCheckedKeys(Array.from(merged));
  };

  // 打开：拉部门树 + 回显；历史绑定直接用回显 deptName（免反查，对齐文件头③）
  useEffect(() => {
    if (!open || !user?.id) return;
    let alive = true;
    setLoading(true);
    setTreeData([]);
    setCheckedKeys([]);
    setExpandedKeys([]);
    setPreserved([]);
    setKeyword('');
    Promise.all([
      loadDeptTree(user).catch((e) => {
        console.warn(
          '[UserDeptAssignModal] 部门树加载失败，本次打开无可选树：',
          e,
        );
        return [] as any[];
      }),
      fetchUserDepts(user.id).catch((e) => {
        console.warn(
          '[UserDeptAssignModal] 已分配部门回显失败，本次打开无回显：',
          e,
        );
        return [] as UserDeptItem[];
      }),
    ])
      .then(([depts, items]) => {
        if (!alive) return;
        const textMap = new Map<string, string>();
        const flat = normalizeDepts(depts ?? []);
        const tree = buildDeptTree(flat, textMap);
        flatRef.current = flat;
        searchTextRef.current = textMap;
        allIdsRef.current = new Set(collectAllKeys(tree).map(String));
        setTreeData(tree);
        setExpandedKeys(tree.map((n) => String(n.key))); // 默认展开一级根部门
        const echo = items ?? [];
        const echoIds = echo.map((i) => String(i.deptId));
        const sel = echoIds.filter((id) => allIdsRef.current.has(id));
        const presIds = echoIds.filter((id) => !allIdsRef.current.has(id));
        const nameOf = new Map(
          echo.map((i) => [
            String(i.deptId),
            String(i.deptName ?? `#${i.deptId}`),
          ]),
        );
        setPreserved(
          presIds.map((id) => ({
            id: Number(id),
            name: nameOf.get(id) ?? `#${id}`,
          })),
        );
        const def = echo.find((i) => Number(i.isDefault) === 1);
        defaultDeptIdRef.current = def ? Number(def.deptId) : undefined;
        baselineIdsRef.current = new Set(echoIds);
        setCheckedKeys(sel);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 提交口径：勾选真实部门 ∪ 历史绑定（§红线②；deptIds 恒传，[]=清空） */
  const buildDeptIds = (): number[] => {
    const all = new Set<string>(preserved.map((p) => String(p.id)));
    checkedKeys.forEach((k) => {
      const s = String(k);
      if (allIdsRef.current.has(s)) all.add(s);
    });
    return Array.from(all).map(Number);
  };

  const selectedCount = useMemo(
    () => buildDeptIds().length,
    [checkedKeys, preserved], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const isChanged = (): boolean => {
    const cur = new Set(buildDeptIds().map(String));
    const base = baselineIdsRef.current;
    if (cur.size !== base.size) return true;
    for (const v of cur) if (!base.has(v)) return true;
    return false;
  };

  // ===== 工具条 =====
  const expandAll = () => {
    setKeyword('');
    setExpandedKeys(collectAllKeys(treeData));
  };
  const collapseAll = () => {
    setKeyword('');
    setExpandedKeys([]);
  };
  const selectAll = () => {
    const leaves: Key[] = [];
    const walk = (nodes: DataNode[]): void => {
      nodes.forEach((n) => {
        if (n.children?.length) walk(n.children);
        else leaves.push(n.key);
      });
    };
    walk(kw ? filteredTree : treeData);
    setCheckedKeys((prev) => {
      const s = new Set(prev.map(String));
      // ★修复⑨：花括号（Set.add 有返回值；消原 421）
      leaves.forEach((l) => {
        s.add(String(l));
      });
      return Array.from(s);
    });
  };
  const deselectAll = () => setCheckedKeys([]);
  const clearAll = () => {
    setCheckedKeys([]);
    setPreserved([]);
  };

  // ===== 右侧已选面板（已选部门 + 历史绑定；点击 Tag 移除，双向联动）=====
  const selectedGroups = useMemo<SelectedGroupView[]>(() => {
    const checkedSet = new Set(checkedKeys.map(String));
    const groups: SelectedGroupView[] = [];
    const items = flatRef.current
      .filter((d) => checkedSet.has(d.id))
      .map((d) => ({ id: d.id, name: d.name }));
    if (items.length) {
      groups.push({
        key: 'tree',
        label: '已选部门',
        color: 'blue',
        items,
      });
    }
    if (preserved.length) {
      groups.push({
        key: 'preserved',
        label: '历史绑定（不在当前部门树）',
        color: 'orange',
        items: preserved.map((p) => ({
          id: String(p.id),
          name: p.name,
        })),
      });
    }
    return groups;
  }, [checkedKeys, preserved]);

  const removeSelected = (g: SelectedGroupView, it: { id: string }) => {
    if (g.key === 'preserved') {
      setPreserved((prev) => prev.filter((p) => String(p.id) !== it.id));
      return;
    }
    setCheckedKeys((keys) => keys.filter((k) => String(k) !== it.id));
  };

  // ===== 保存 =====
  const doSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const deptIds = buildDeptIds();
      // 三态落位：deptIds 恒传（[]=清空）
      const payload: { deptIds: number[]; defaultDeptId?: number } = {
        deptIds,
      };
      const def = defaultDeptIdRef.current;
      if (def != null && deptIds.includes(def)) {
        payload.defaultDeptId = def;
      }
      const res = await assignUserDepts(user.id, payload);
      message.success(res?.message || '分配成功');
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
      throw e; // 保持确认框开启（对齐角色弹窗约定）
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => {
    if (!user?.id) return;
    if (!isChanged()) {
      message.info('授权未变更');
      return;
    }
    Modal.confirm({
      title: '覆盖确认',
      content: `本次将全量覆盖「${user.name}」的部门绑定，保存后共保留 ${buildDeptIds().length} 个部门，未保留的部门将被解除绑定，是否继续？`,
      okText: '继续保存',
      cancelText: '再看看',
      onOk: doSave,
    });
  };

  return (
    <DraggableModal
      title={`分配部门：${user?.name ?? ''}${
        user?.account ? `（${user.account}）` : ''
      }`}
      open={open}
      onOk={handleSubmit}
      confirmLoading={saving}
      okButtonProps={{ disabled: saving }}
      okText="保存"
      onCancel={onClose}
      destroyOnClose
      width={880}
      centered
      styles={{
        body: {
          maxHeight: 'calc(100vh - 240px)',
          overflowY: 'auto',
        },
      }}
    >
      <div className="user-assign-tip">
        勾选部门即授权（勾选上级将选中其全部下级）；保存为全量覆盖，未保留的部门将被解除绑定；右侧「历史绑定」为已不在部门树中的历史授权，移除标签即解除绑定。
      </div>

      <div className="user-assign-body">
        <div className="user-assign-left">
          <div className="user-tree-toolbar">
            <Input
              allowClear
              className="user-tree-toolbar__search"
              placeholder="搜索部门名称"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Button size="small" onClick={expandAll}>
              展开全部
            </Button>
            <Button size="small" onClick={collapseAll}>
              折叠全部
            </Button>
            <Button size="small" onClick={selectAll}>
              全选
            </Button>
            <Button size="small" onClick={deselectAll}>
              全不选
            </Button>
            <Button size="small" danger onClick={clearAll}>
              一键清空
            </Button>
          </div>
          <Spin spinning={loading}>
            {/* ★修复⑦：固定高——搜索过滤不缩框，内容框内滚动 */}
            <div
              className="user-tree-box"
              style={{
                height: BOX_H,
                minHeight: 280,
                overflow: 'auto',
              }}
            >
              {filteredTree.length > 0 ? (
                <Tree
                  checkable
                  checkStrictly={false} // 级联：勾父=全选子树（语义见文件头①；需独立勾选改 true）
                  selectable={false}
                  expandedKeys={displayExpanded}
                  onExpand={(keys) => {
                    if (!kw) setExpandedKeys(keys);
                  }}
                  treeData={filteredTree}
                  checkedKeys={checkedKeys}
                  onCheck={handleCheck} // ★修复⑧：搜索态勾选安全（隐藏保留+级联补齐/裁剪）
                />
              ) : (
                !loading && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: 40,
                      color: '#999',
                    }}
                  >
                    暂无部门数据
                    <div style={{ fontSize: 12, marginTop: 8 }}>
                      请先在部门管理中维护部门
                    </div>
                  </div>
                )
              )}
            </div>
          </Spin>
        </div>

        <div className="user-assign-right">
          <div className="user-assign-right__title">
            已选部门
            <span className="user-assign-right__count">{selectedCount}</span>
          </div>
          {/* ★修复⑦：固定高——勾选 Tag 增多只在框内滚动，弹窗不变高 */}
          <div
            className="user-assign-right__list"
            style={{
              height: BOX_H,
              minHeight: 280,
              overflowY: 'auto',
            }}
          >
            {selectedGroups.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="左侧勾选部门后，此处实时汇总"
              />
            ) : (
              selectedGroups.map((g) => (
                <div key={g.key} className="user-assign-group">
                  <div className="user-assign-group__label">
                    {g.label}
                    <span className="user-assign-group__num">
                      {g.items.length}
                    </span>
                  </div>
                  <div className="user-assign-group__tags">
                    {g.items.map((it) => (
                      <Tooltip key={it.id} title="点击移除">
                        <Tag
                          className="user-assign-tag"
                          color={g.color}
                          closable
                          onClose={(e) => {
                            e.preventDefault(); // 阻断默认关闭动画，走受控移除
                            removeSelected(g, it);
                          }}
                        >
                          {it.name}
                        </Tag>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DraggableModal>
  );
}
