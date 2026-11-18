/**
 * 用户-角色分配弹窗（左树右已选面板）—— 契约：用户-角色分配管理 v1.0 §2.2/§6.4/§6.5/§7.3
 * 形态对齐 Role/AssignMenuModal：左=树形勾选（一级=角色类型分组，二级=角色叶子），
 * 右=已选实时汇总（点击 Tag 移除，双向联动）；宽 880 双栏，窄屏自动换行。
 *
 * 【形态说明】角色为扁平数据，分组由前端按 roleType 虚拟构建；无页签；无默认角色 UI——
 * defaultRoleId 仅在回显存在且仍被勾选时原样透传（防止覆盖保存把默认标记抹成「其他」；
 * 取消勾选默认角色 → 不传 → 后端全部标记「其他」；产品确认废弃可删 doSave 中的透传 if）。
 *
 * 契约红线：
 * ① preserved 兜底（数据丢失级）：回显 roleId 不在树内（已停用角色）→ 右侧
 *    「历史授权」分组，移除标签 = 主动解绑；不做兜底 = 全量覆盖静默删除（§3.1-6）；
 * ② roleIds 三态：[]=清空 / null=报错（service 不过 cleanPayload，[] 保得住）；
 * ③ 提交口径：勾选角色叶子 ∪ preserved（分组 key 为 group-*，不进 payload）；
 * ④ 未变更不提交（基线=回显角色集合，只比 roleIds）；覆盖确认含摘要；
 *    失败 throw 保持确认框开启；
 * ⑤ 搜索为树内本地过滤（options 上限 50），命中文本在 buildRoleTree 时写入
 *    searchTextRef（name+code 小写），不从 JSX 反解。
 *
 * ★2026-11-17 修复（与 UserDeptAssignModal 同构）：
 * ⑥ 弹窗尺寸固定：左右两框固定高（BOX_H），搜索/勾选变化不再撑缩弹窗，滚动收敛到框内；
 * ⑦ 搜索态勾选安全：onCheck 三步合并——隐藏保留 + 新勾分组隐藏后代补齐 + 取消分组隐藏后代裁剪。
 *
 * ★2026-11-18 biome 修复：
 * ⑧ forEach 箭头体一律加花括号（useIterableCallbackReturn：Set.add/Map.set 有返回值，
 *   裸表达式箭头被视为隐式返回）；
 * ⑨ 树节点 title 的 span 补 key（useJsxKeyInIterable；key 用节点自身唯一标识，非下标）。
 */
import {
  ApartmentOutlined,
  BankOutlined,
  TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons';
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
import type { BizError } from '@/services/org/role';
import {
  fetchRoleOptions,
  getRolePage,
  ROLE_STATUS,
  ROLE_TYPE,
  type RoleOptionVO,
} from '@/services/org/role';
import {
  assignUserRoles,
  fetchUserRoles,
  type UserRoleItem,
  type UserVO,
} from '@/services/org/user';
import './index.less';

interface Props {
  open: boolean;
  /** null = 不展示 */
  user: UserVO | null;
  onClose: () => void;
  onSaved: () => void;
}

/** preserved 项：停用角色历史授权（绑定角色不可删除 4001 → preserved 均为停用角色） */
interface PreservedItem {
  id: number;
  name: string;
}

/** 已选面板条目 */
interface SelectedItem {
  id: string;
  name: string;
  /** 分组 key（角色类型值；-1 = 停用角色历史授权；-2 = 未知类型兜底组） */
  group: number;
}

interface SelectedGroup {
  group: number;
  label: string;
  color: string;
  items: SelectedItem[];
}

/** 树分组构建的中间结构（显式类型，保证每个组都有 icon，消除联合类型收窄问题） */
interface TreeGroup {
  key: string;
  label: string;
  color: string;
  icon: typeof ApartmentOutlined;
  items: RoleOptionVO[];
}

const PRESERVED_GROUP = -1;

/** 树一级分组（roleType → 组；文案对齐 role/shared 的枚举标签） */
const TYPE_GROUPS: {
  key: number;
  label: string;
  color: string;
  icon: typeof ApartmentOutlined;
}[] = [
  {
    key: ROLE_TYPE.PLATFORM,
    label: '平台角色',
    color: 'geekblue',
    icon: ApartmentOutlined,
  },
  {
    key: ROLE_TYPE.HOSPITAL,
    label: '医院角色',
    color: 'blue',
    icon: BankOutlined,
  },
  {
    key: ROLE_TYPE.REGION,
    label: '区域角色',
    color: 'purple',
    icon: TeamOutlined,
  },
];

const GROUP_KEY_PREFIX = 'group-';

// ===== 树构建 / 过滤工具（id 一律 String 归一化）=====

/**
 * 角色平铺列表 → 双层树：一级=类型分组（可勾，级联全选组内角色），二级=角色叶子。
 * 同时把每个节点的可搜索文本（分组名 / name+code，小写）写入 textMap 供过滤使用。
 */
function buildRoleTree(
  opts: RoleOptionVO[],
  textMap: Map<string, string>,
): DataNode[] {
  const known = new Set(TYPE_GROUPS.map((g) => String(g.key)));
  const others = opts.filter((o) => !known.has(String(o.roleType)));
  const groups: TreeGroup[] = [
    ...TYPE_GROUPS.map<TreeGroup>((g) => ({
      key: String(g.key),
      label: g.label,
      color: g.color,
      icon: g.icon,
      items: opts.filter((o) => String(o.roleType) === String(g.key)),
    })),
    ...(others.length
      ? [
          {
            key: 'other',
            label: '其他角色',
            color: 'default',
            icon: TagsOutlined,
            items: others,
          },
        ]
      : []),
  ].filter((g) => g.items.length > 0);

  return groups.map((g) => {
    const IconComp = g.icon;
    const groupKey = `${GROUP_KEY_PREFIX}${g.key}`;
    textMap.set(groupKey, g.label.toLowerCase());
    // ★biome⑨：span 补 key（useJsxKeyInIterable；groupKey 为节点自身唯一标识）
    const groupTitle: ReactNode = (
      <span key={groupKey} className="user-role-node">
        <IconComp className="user-role-node__icon" />
        <span className="user-role-node__name">{g.label}</span>
      </span>
    );
    return {
      key: groupKey,
      title: groupTitle,
      selectable: false,
      children: g.items.map((o) => {
        textMap.set(String(o.id), `${o.name} ${o.code}`.toLowerCase());
        // ★biome⑨：span 补 key（String(o.id) 为叶子唯一标识）
        const leafTitle: ReactNode = (
          <span key={String(o.id)} className="user-role-node">
            <span className="user-role-node__name">{o.name}</span>
            <span className="user-role-node__code">{o.code}</span>
          </span>
        );
        return { key: String(o.id), title: leafTitle, selectable: false };
      }),
    };
  });
}

/** 全部节点 key（展开全部 / 搜索态自动展开用） */
function collectAllKeys(nodes: DataNode[], acc: Key[] = []): Key[] {
  nodes.forEach((n) => {
    acc.push(n.key);
    if (n.children?.length) collectAllKeys(n.children, acc);
  });
  return acc;
}

// ★2026-11-17 修复⑥：双栏固定高度（只随视口变化，不随搜索/勾选数量变化）
const BOX_H = 'min(520px, calc(100vh - 420px))';

/**
 * ★2026-11-17 修复⑦辅助：全量树中 key 节点的全部后代 id（任意层级，String 数组）。
 * 搜索过滤态下 antd 的级联只作用于「可见树」；勾/取消分组时用它把
 * 被搜索隐藏的后代一并补齐/裁剪，保证「勾分组=全选组内角色」不因过滤而残缺。
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

/** 叶子 id 集合（= 真实角色 id，排除 group-* 分组节点）——提交与回显的边界 */
function collectLeafIdSet(
  nodes: DataNode[],
  acc: Set<string> = new Set(),
): Set<string> {
  nodes.forEach((n) => {
    if (n.children?.length) collectLeafIdSet(n.children, acc);
    else acc.add(String(n.key));
  });
  return acc;
}

/** 树内搜索：命中（自身文本或子孙命中）保留；分组自命中时整组保留（对齐 AssignMenuModal） */
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

export default function UserRoleAssignModal({
  open,
  user,
  onClose,
  onSaved,
}: Props) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<RoleOptionVO[]>([]);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<Key[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);
  const [preserved, setPreserved] = useState<PreservedItem[]>([]);
  const [keyword, setKeyword] = useState('');
  /** 回显的默认角色（无 UI，只透传；见文件头说明） */
  const defaultRoleIdRef = useRef<number | undefined>(undefined);
  /** 节点可搜索文本（key → 小写文本），buildRoleTree 时填充 */
  const searchTextRef = useRef<Map<string, string>>(new Map());
  /** 叶子 id 集合（提交/回显边界） */
  const leafIdSetRef = useRef<Set<string>>(new Set());
  /** 打开时的基线（回显角色集合），isChanged 比对用 */
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
   * ★2026-11-17 修复⑦：勾选处理（搜索过滤态安全）
   * antd Tree 的 onCheck 只按「当前渲染树」重算 checkedKeys——被搜索隐藏的
   * 已勾选节点会被直接丢弃（右侧已选面板随之丢项）。三步：
   * ① 隐藏保留：不在当前渲染树内的旧勾选原样保留；
   * ② 级联补齐：新勾选的分组/角色，其隐藏后代一并入选（勾分组=全选组内，含隐藏部分）；
   * ③ 级联裁剪：取消勾选的分组，其隐藏后代一并移除（对齐未过滤时的级联语义）。
   * ★biome⑧：四处 forEach 箭头体全部加花括号（Set.add 有返回值）
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
    incoming.forEach((k) => {
      merged.add(k); // 可见树的重算结果原样采用
    });
    const added = [...incoming].filter((k) => !prev.has(k));
    const removed = [...prev].filter((k) => visible.has(k) && !incoming.has(k));
    added.forEach((k) => {
      collectDescendantIds(treeData, k).forEach((d) => {
        merged.add(d);
      });
    }); // ② 补齐隐藏后代（内外两层都要花括号）
    removed.forEach((k) => {
      collectDescendantIds(treeData, k).forEach((d) => {
        merged.delete(d);
      });
    }); // ③ 裁剪隐藏后代（内外两层都要花括号）
    setCheckedKeys(Array.from(merged));
  };

  // 打开：拉角色全量（树数据源）+ 回显；preserved 名称经停用角色分页反查（§7.3）
  useEffect(() => {
    if (!open || !user?.id) return;
    let alive = true;
    setLoading(true);
    setOptions([]);
    setTreeData([]);
    setCheckedKeys([]);
    setExpandedKeys([]);
    setPreserved([]);
    setKeyword('');
    Promise.all([
      fetchRoleOptions(),
      fetchUserRoles(user.id).catch((e) => {
        console.warn(
          '[UserRoleAssignModal] 已分配角色回显失败，本次打开无回显：',
          e,
        );
        return [] as UserRoleItem[];
      }),
    ])
      .then(async ([opts, items]) => {
        if (!alive) return;
        const textMap = new Map<string, string>();
        const tree = buildRoleTree(opts, textMap);
        searchTextRef.current = textMap;
        setTreeData(tree);
        setExpandedKeys(tree.map((n) => String(n.key)));
        leafIdSetRef.current = collectLeafIdSet(tree);
        const echoIds = (items ?? []).map((i) => String(i.roleId));
        const sel = echoIds.filter((id) => leafIdSetRef.current.has(id));
        const presIds = echoIds.filter((id) => !leafIdSetRef.current.has(id));
        let pres: PreservedItem[] = [];
        if (presIds.length) {
          try {
            const page = await getRolePage({
              status: ROLE_STATUS.DISABLED,
              page: 1,
              size: 100,
            });
            const nameMap = new Map<number, string>();
            // ★biome⑧：花括号（Map.set 有返回值）
            (page.records ?? []).forEach((r) => {
              nameMap.set(Number(r.id), r.name);
            });
            pres = presIds.map((id) => ({
              id: Number(id),
              name: nameMap.get(Number(id)) ?? `#${id}`,
            }));
          } catch {
            pres = presIds.map((id) => ({
              id: Number(id),
              name: `#${id}`,
            }));
          }
        }
        const defItem = (items ?? []).find((i) => Number(i.isDefault) === 1);
        defaultRoleIdRef.current = defItem ? Number(defItem.roleId) : undefined;
        baselineIdsRef.current = new Set(echoIds);
        setOptions(opts);
        setCheckedKeys(sel);
        setPreserved(pres);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 提交口径：勾选叶子 ∪ preserved（分组节点 group-* 不进 payload，§7.3） */
  const buildRoleIds = (): number[] => {
    const all = new Set<string>(preserved.map((p) => String(p.id)));
    checkedKeys.forEach((k) => {
      const s = String(k);
      if (!s.startsWith(GROUP_KEY_PREFIX) && leafIdSetRef.current.has(s)) {
        all.add(s);
      }
    });
    return Array.from(all).map(Number);
  };

  const selectedCount = useMemo(
    () => buildRoleIds().length,
    [checkedKeys, preserved], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const isChanged = (): boolean => {
    const cur = new Set(buildRoleIds().map(String));
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
    // 搜索态下只追加当前过滤结果（与既有勾选取并集）
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
      // ★biome⑧：花括号（Set.add 有返回值）
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

  // ===== 右侧已选面板（按类型分组 + 历史授权组；点击 Tag 移除，双向联动）=====
  const selectedGroups = useMemo<SelectedGroup[]>(() => {
    const checkedSet = new Set(checkedKeys.map(String));
    const groups: SelectedGroup[] = [];
    TYPE_GROUPS.forEach((g) => {
      const items: SelectedItem[] = [];
      options.forEach((o) => {
        if (String(o.roleType) !== String(g.key)) return;
        if (!checkedSet.has(String(o.id))) return;
        items.push({
          id: String(o.id),
          name: o.name,
          group: g.key,
        });
      });
      if (items.length) {
        groups.push({
          group: g.key,
          label: g.label,
          color: g.color,
          items,
        });
      }
    });
    // 未知 roleType 的已选角色兜底进「其他角色」组
    const known = new Set(TYPE_GROUPS.map((g) => String(g.key)));
    const otherItems: SelectedItem[] = [];
    options.forEach((o) => {
      if (known.has(String(o.roleType))) return;
      if (!checkedSet.has(String(o.id))) return;
      otherItems.push({
        id: String(o.id),
        name: o.name,
        group: -2,
      });
    });
    if (otherItems.length) {
      groups.push({
        group: -2,
        label: '其他角色',
        color: 'default',
        items: otherItems,
      });
    }
    if (preserved.length) {
      groups.push({
        group: PRESERVED_GROUP,
        label: '历史授权（停用角色）',
        color: 'orange',
        items: preserved.map((p) => ({
          id: String(p.id),
          name: `${p.name}（已停用）`,
          group: PRESERVED_GROUP,
        })),
      });
    }
    return groups;
  }, [options, checkedKeys, preserved]);

  const removeSelected = (item: SelectedItem) => {
    if (item.group === PRESERVED_GROUP) {
      setPreserved((prev) => prev.filter((p) => String(p.id) !== item.id));
      return;
    }
    setCheckedKeys((keys) => keys.filter((k) => String(k) !== item.id));
  };

  // ===== 保存 =====
  const doSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const roleIds = buildRoleIds();
      // 三态落位：roleIds 恒传（[]=清空）（§6.5）
      const payload: { roleIds: number[]; defaultRoleId?: number } = {
        roleIds,
      };
      // 默认角色透传：回显值仍被勾选时原样带上，防止覆盖保存抹掉默认标记；
      // 已被取消勾选 → 不传 → 后端全部标记「其他」（产品确认废弃可删此 if）
      const def = defaultRoleIdRef.current;
      if (def != null && roleIds.includes(def)) {
        payload.defaultRoleId = def;
      }
      const res = await assignUserRoles(user.id, payload);
      message.success(res?.message || '分配成功');
      onSaved();
    } catch (e) {
      const err = e as BizError;
      if (err?.code === 4402) {
        message.warning(err.message); // 后端文案自带「请通过用户组授权并走合规确认」引导，原文 toast
      } else {
        message.error((e as Error).message);
      }
      throw e;
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
      content: `本次将全量覆盖「${user.name}」的角色绑定，保存后共保留 ${buildRoleIds().length} 个角色（含已停用角色的历史授权），未保留的角色将被解除绑定，是否继续？`,
      okText: '继续保存',
      cancelText: '再看看',
      onOk: doSave,
    });
  };

  return (
    <DraggableModal
      title={`分配角色：${user?.name ?? ''}${
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
        勾选角色即授权（勾选分组将选中组内全部角色）；保存为全量覆盖，未保留的角色将被解除绑定；已停用角色在右侧「历史授权」区，移除标签即解除绑定。
      </div>

      {/* 左右双栏：左=树形勾选，右=已选实时汇总（对齐 AssignMenuModal） */}
      <div className="user-assign-body">
        <div className="user-assign-left">
          <div className="user-tree-toolbar">
            <Input
              allowClear
              className="user-tree-toolbar__search"
              placeholder="搜索角色名称 / 编码"
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
            {/* ★修复⑥：固定高——搜索过滤不缩框，内容框内滚动 */}
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
                  checkStrictly={false} // 级联：勾分组=全选组内角色
                  selectable={false}
                  expandedKeys={displayExpanded}
                  onExpand={(keys) => {
                    if (!kw) setExpandedKeys(keys);
                  }}
                  treeData={filteredTree}
                  checkedKeys={checkedKeys}
                  onCheck={handleCheck} // ★修复⑦：搜索态勾选安全（隐藏保留+级联补齐/裁剪）
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
                    暂无可用角色
                    <div style={{ fontSize: 12, marginTop: 8 }}>
                      请先在角色管理中创建并启用角色
                    </div>
                  </div>
                )
              )}
            </div>
          </Spin>
        </div>

        {/* 右侧已选面板（实时联动，点击 Tag 可移除） */}
        <div className="user-assign-right">
          <div className="user-assign-right__title">
            已选角色
            <span className="user-assign-right__count">{selectedCount}</span>
          </div>
          {/* ★修复⑥：固定高——勾选 Tag 增多只在框内滚动，弹窗不变高 */}
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
                description="左侧勾选角色后，此处实时汇总"
              />
            ) : (
              selectedGroups.map((g) => (
                <div key={g.group} className="user-assign-group">
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
                            removeSelected(it);
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
