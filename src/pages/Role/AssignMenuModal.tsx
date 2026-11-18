/**
 * 分配菜单弹窗（可拖拽 + 三端页签 + 左树右已选面板）—— 契约：角色管理 v1.0 §2.2/§6.4/§7
 * 当前态（M1~M3 全量闭环）：
 *  ① 三页签（平台/销毁柜/PDA）按 clientType 独立加载菜单树与勾选/展开态（OPT-11 闭环：
 *     枚举 1平台/2销毁柜/3PDA，回显为跨端全量 id）；
 *  ② /menu/tree 不传 status 返回含停用全量树 → 停用节点置灰禁勾选 + Tooltip（OPT-03 闭环）；
 *  ③ 提交/回显全量口径：三端各自 checked ∪ half ∪ full ∪ 树外保留（OPT-04 闭环）；
 *  ④ 回显 number[] 纯 id 数组；String 归一化比对 + 三形态兼容层（OPT-10 闭环，兼容层保留
 *     至下迭代清理）；id 类型与树一致。
 * 交互：默认展开一级 + 展开/折叠全部 / 工具条（搜索·全选·全不选·一键清空·已选计数）/
 *      右侧已选面板实时联动（点击 Tag 可移除）/ 覆盖确认含摘要 / 保存失败确认框保持开启 /
 *      assignMenus 不走 cleanPayload（[] = 清空，严禁洗成 null）
 * 二期预留：OPT-12 列表页只读「查看权限」抽屉
 */
import {
  AppstoreOutlined,
  FolderOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Empty,
  Input,
  Modal,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Tree,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { Key, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import DraggableModal from '@/components/DraggableModal';
import {
  CLIENT_TYPE,
  getMenuTree,
  MENU_STATUS,
  MENU_TYPE,
  type MenuTreeVO,
} from '@/services/org/menu';
import { assignMenus, getRoleMenuIds, type RoleVO } from '@/services/org/role';
import './index.less';

interface Props {
  open: boolean;
  role: RoleVO | null;
  onClose: () => void;
  onSaved: () => void;
}

/** 应用页签 × clientType 映射（枚举值以 services/org/menu.ts 的 CLIENT_TYPE 为准，已与后端对齐） */
const CLIENT_TABS: { key: number; label: string }[] = [
  { key: CLIENT_TYPE.WEB, label: '平台应用' },
  { key: CLIENT_TYPE.CABINET, label: '销毁柜应用' },
  { key: CLIENT_TYPE.PDA, label: 'PDA应用' },
];

/** 树外历史授权分组 key（不属于任何一端树内） */
const PRESERVED_CLIENT = -1;

/** 按端加载菜单树，单端失败降级为空树不阻塞其他页签 */
async function safeGetTree(clientType: number): Promise<MenuTreeVO[]> {
  try {
    return (await getMenuTree({ clientType })) ?? [];
  } catch (e) {
    // 调整：诊断文案去掉编号，改为可直接行动的提示
    console.warn(
      `[AssignMenuModal] clientType=${clientType} 菜单树加载失败，该页签将显示为空：`,
      e,
    );
    return [];
  }
}

// ===== 树工具函数（id 一律 String 归一化；forEach 回调一律块级语句）=====

function collectAllIdStrs(
  nodes: MenuTreeVO[],
  acc: Set<string> = new Set(),
): Set<string> {
  nodes.forEach((n) => {
    acc.add(String(n.id));
    if (n.children?.length) collectAllIdStrs(n.children, acc);
  });
  return acc;
}

function collectLeafIdStrs(nodes: MenuTreeVO[], acc: string[] = []): string[] {
  nodes.forEach((n) => {
    if (n.children?.length) collectLeafIdStrs(n.children, acc);
    else acc.push(String(n.id));
  });
  return acc;
}

/** 只勾已授权叶子：父态由级联推导，避免父 id 回显放大勾选范围 */
function collectGrantedLeafIdStrs(
  nodes: MenuTreeVO[],
  granted: Set<string>,
  acc: string[] = [],
): string[] {
  nodes.forEach((n) => {
    if (n.children?.length) collectGrantedLeafIdStrs(n.children, granted, acc);
    else if (granted.has(String(n.id))) acc.push(String(n.id));
  });
  return acc;
}

function collectDisabledIdStrs(
  nodes: MenuTreeVO[],
  acc: Set<string> = new Set(),
): Set<string> {
  nodes.forEach((n) => {
    if (String(n.status ?? MENU_STATUS.NORMAL) === MENU_STATUS.DISABLED)
      acc.add(String(n.id));
    if (n.children?.length) collectDisabledIdStrs(n.children, acc);
  });
  return acc;
}

/** 回显 id 归一化：兼容 number[] / string[] / {menuId|id} 对象数组
 *  （OPT-10 已定稿 number[]；兼容层无害，按下迭代清理计划保留） */
function toGrantedIdStrSet(raw: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(raw)) return out;
  raw.forEach((item) => {
    if (item == null) return;
    if (typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const v = o.menuId ?? o.id;
      if (v != null) out.add(String(v));
      return;
    }
    out.add(String(item));
  });
  return out;
}

/** 由 checkedKeys 反推半选/全选父级（程序化改勾选不触发 onCheck，需自行推导） */
function deriveCheckSets(
  nodes: MenuTreeVO[],
  checkedSet: Set<string>,
): { half: Set<string>; full: Set<string> } {
  const half = new Set<string>();
  const full = new Set<string>();
  const walk = (n: MenuTreeVO): { all: boolean; some: boolean } => {
    if (!n.children?.length) {
      const c = checkedSet.has(String(n.id));
      return { all: c, some: c };
    }
    let all = true;
    let some = false;
    n.children.forEach((c) => {
      const r = walk(c);
      all = all && r.all;
      some = some || r.some;
    });
    if (all) full.add(String(n.id));
    else if (some) half.add(String(n.id));
    return { all, some };
  };
  nodes.forEach((n) => {
    walk(n);
  });
  return { half, full };
}

function filterTreeNodes(nodes: MenuTreeVO[], kw: string): MenuTreeVO[] {
  const res: MenuTreeVO[] = [];
  nodes.forEach((n) => {
    const hit = n.name.toLowerCase().includes(kw);
    const childHit = n.children?.length ? filterTreeNodes(n.children, kw) : [];
    if (hit || childHit.length) {
      res.push({ ...n, children: hit ? n.children : childHit });
    }
  });
  return res;
}

/** 菜单树 → Tree DataNode：key 统一 String + 图标 + 类型标识 + 停用置灰禁勾选 */
function toTreeData(nodes: MenuTreeVO[]): DataNode[] {
  return nodes.map((n) => {
    const mt = String(n.menuType ?? MENU_TYPE.MENU);
    const disabledNode =
      String(n.status ?? MENU_STATUS.NORMAL) === MENU_STATUS.DISABLED;
    const IconComp =
      mt === MENU_TYPE.DIR
        ? FolderOutlined
        : mt === MENU_TYPE.BUTTON
          ? TagsOutlined
          : AppstoreOutlined;
    const typeLabel =
      mt === MENU_TYPE.DIR ? '目录' : mt === MENU_TYPE.BUTTON ? '按钮' : '菜单';
    const typeColor =
      mt === MENU_TYPE.DIR
        ? 'geekblue'
        : mt === MENU_TYPE.BUTTON
          ? 'gold'
          : 'blue';
    const title: ReactNode = (
      <Tooltip
        key={String(n.id)}
        title={disabledNode ? '已停用，保留历史授权' : undefined}
      >
        <span
          className={
            disabledNode
              ? 'role-menu-node role-menu-node--disabled'
              : 'role-menu-node'
          }
        >
          <IconComp className="role-menu-node__icon" />
          <span className="role-menu-node__name">{n.name}</span>
          <Tag className="role-menu-node__tag" color={typeColor}>
            {typeLabel}
          </Tag>
        </span>
      </Tooltip>
    );
    return {
      key: String(n.id),
      title,
      disableCheckbox: disabledNode,
      selectable: false,
      children: n.children?.length ? toTreeData(n.children) : undefined,
    };
  });
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

type ClientStateMap = Record<number, Key[]>;

/** 已选面板条目 */
interface SelectedItem {
  id: string;
  name: string;
  /** 所属端（PRESERVED_CLIENT = 树外历史授权） */
  client: number;
}
/** 已选面板分组 */
interface SelectedGroup {
  client: number;
  label: string;
  color: string;
  items: SelectedItem[];
}

export default function AssignMenuModal({
  open,
  role,
  onClose,
  onSaved,
}: Props) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trees, setTrees] = useState<Record<number, MenuTreeVO[]>>({});
  const [checkedMap, setCheckedMap] = useState<ClientStateMap>({});
  const [expandedMap, setExpandedMap] = useState<ClientStateMap>({});
  const [preserved, setPreserved] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<number>(CLIENT_TYPE.WEB);
  const [keyword, setKeyword] = useState('');
  const initialProposedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !role?.id) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      ...CLIENT_TABS.map((t) => safeGetTree(t.key)),
      getRoleMenuIds(role.id).catch((e) => {
        // 调整：诊断文案可直接行动
        console.warn(
          '[AssignMenuModal] 已授权菜单回显失败，本次打开将无回显，请检查接口：',
          e,
        );
        return [] as unknown[];
      }),
    ])
      .then((results) => {
        if (!alive) return;
        const echo = results[results.length - 1];
        const treeList = CLIENT_TABS.map((_, i) => results[i] as MenuTreeVO[]);
        const granted = toGrantedIdStrSet(echo);
        if (!granted.size) {
          console.warn(
            '[AssignMenuModal] 已授权回显为空或结构未识别，原始返回：',
            echo,
            '——若该角色应已有授权，请核对 /role/{id}/menus 实现与授权落库',
          );
        }
        const allTreeIds = new Set<string>();
        treeList.forEach((t) => {
          collectAllIdStrs(t, allTreeIds);
        });
        const nextPreserved = new Set(
          [...granted].filter((id) => !allTreeIds.has(id)),
        );
        const nextChecked: ClientStateMap = {};
        const nextExpanded: ClientStateMap = {};
        CLIENT_TABS.forEach((t, i) => {
          const tree = treeList[i];
          nextChecked[t.key] = collectGrantedLeafIdStrs(tree, granted);
          nextExpanded[t.key] = tree.map((n) => String(n.id));
        });
        // 打开基线走同一套提交通道，保证变更检测口径一致
        const baseline = new Set<string>([...nextPreserved]);
        CLIENT_TABS.forEach((t, i) => {
          const checked = new Set<string>(nextChecked[t.key] ?? []);
          if (!treeList[i].length) {
            checked.forEach((k) => {
              baseline.add(k);
            });
            return;
          }
          const { half, full } = deriveCheckSets(treeList[i], checked);
          checked.forEach((k) => {
            baseline.add(k);
          });
          half.forEach((k) => {
            baseline.add(k);
          });
          full.forEach((k) => {
            baseline.add(k);
          });
        });
        setTrees(
          Object.fromEntries(CLIENT_TABS.map((t, i) => [t.key, treeList[i]])),
        );
        setCheckedMap(nextChecked);
        setExpandedMap(nextExpanded);
        setPreserved(nextPreserved);
        initialProposedRef.current = baseline;
        setActiveTab(CLIENT_TYPE.WEB);
        setKeyword('');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, role?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 当前页签派生 =====
  const curTree = trees[activeTab] ?? [];
  const kw = keyword.trim();
  const filteredTree = useMemo(
    () => (kw ? filterTreeNodes(curTree, kw) : curTree),
    [curTree, kw],
  );
  const treeData = useMemo<DataNode[]>(
    () => toTreeData(filteredTree),
    [filteredTree],
  );
  const disabledIdSet = useMemo(
    () => collectDisabledIdStrs(curTree),
    [curTree],
  );
  const displayExpanded = useMemo<Key[]>(
    () =>
      kw
        ? Array.from(collectAllIdStrs(filteredTree))
        : (expandedMap[activeTab] ?? []),
    [kw, filteredTree, expandedMap, activeTab],
  );

  /** 提交口径：三端 checked ∪ half ∪ full ∪ preserved（全量，OPT-04 闭环）
   *  String 归一去重后 Number 化提交（契约 menuIds: number[]） */
  const buildProposedIds = (): number[] => {
    const all = new Set<string>([...preserved]);
    CLIENT_TABS.forEach((t) => {
      const tree = trees[t.key] ?? [];
      const checked = new Set<string>((checkedMap[t.key] ?? []).map(String));
      if (!tree.length) {
        // 该端树为空：已勾选 key 原样保留，防丢授权
        checked.forEach((k) => {
          all.add(k);
        });
        return;
      }
      const { half, full } = deriveCheckSets(tree, checked);
      checked.forEach((k) => {
        all.add(k);
      });
      half.forEach((k) => {
        all.add(k);
      });
      full.forEach((k) => {
        all.add(k);
      });
    });
    return Array.from(all).map(Number);
  };

  const selectedCount = useMemo(
    () => buildProposedIds().length,
    [checkedMap, trees, preserved], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** id → 名称映射（已选面板展示用；树外 id 查不到时回退 #id） */
  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    CLIENT_TABS.forEach((t) => {
      const walk = (nodes: MenuTreeVO[]) => {
        nodes.forEach((n) => {
          m.set(String(n.id), n.name);
          if (n.children?.length) walk(n.children);
        });
      };
      walk(trees[t.key] ?? []);
    });
    return m;
  }, [trees]);

  /** 右侧已选面板数据源——按端分组的已选叶子（叶子=实际功能点，父级不重复展示） */
  const selectedGroups = useMemo<SelectedGroup[]>(() => {
    const groups: SelectedGroup[] = [];
    CLIENT_TABS.forEach((t) => {
      const tree = trees[t.key] ?? [];
      const checked = new Set<string>((checkedMap[t.key] ?? []).map(String));
      let items: SelectedItem[];
      if (!tree.length) {
        // 空树端：勾选原样列出（无名称映射，显示 #id 防静默丢失）
        items = [...checked].map((id) => ({
          id,
          name: `#${id}`,
          client: t.key,
        }));
      } else {
        items = collectLeafIdStrs(tree)
          .filter((id) => checked.has(id))
          .map((id) => ({
            id,
            name: nameMap.get(id) ?? `#${id}`,
            client: t.key,
          }));
      }
      if (items.length) {
        groups.push({ client: t.key, label: t.label, color: 'blue', items });
      }
    });
    if (preserved.size) {
      groups.push({
        client: PRESERVED_CLIENT,
        label: '历史授权（树外）',
        color: 'orange',
        items: [...preserved].map((id) => ({
          id,
          name: nameMap.get(id) ?? `#${id}`,
          client: PRESERVED_CLIENT,
        })),
      });
    }
    return groups;
  }, [trees, checkedMap, preserved, nameMap]);

  /** 已选面板单条移除（同步 checkedMap / preserved，与树勾选双向联动） */
  const removeSelected = (item: SelectedItem) => {
    if (item.client === PRESERVED_CLIENT) {
      setPreserved((p) => {
        const n = new Set(p);
        n.delete(item.id);
        return n;
      });
      return;
    }
    setCheckedMap((m) => ({
      ...m,
      [item.client]: (m[item.client] ?? []).filter(
        (k) => String(k) !== item.id,
      ),
    }));
  };

  const isChanged = (): boolean => {
    const cur = new Set(buildProposedIds().map(String));
    return !setEquals(cur, initialProposedRef.current);
  };

  // ===== 工具条（当前页签）=====
  const expandAll = () => {
    setKeyword('');
    setExpandedMap((m) => ({
      ...m,
      [activeTab]: Array.from(collectAllIdStrs(curTree)),
    }));
  };
  const collapseAll = () => {
    setKeyword('');
    setExpandedMap((m) => ({ ...m, [activeTab]: [] }));
  };
  const selectAll = () => {
    const src = kw ? filteredTree : curTree;
    setCheckedMap((m) => ({
      ...m,
      [activeTab]: collectLeafIdStrs(src).filter(
        (id) => !disabledIdSet.has(id),
      ),
    }));
  };
  const deselectAll = () => setCheckedMap((m) => ({ ...m, [activeTab]: [] }));
  const clearAll = () => {
    setCheckedMap({});
    setPreserved(new Set());
  };

  const doSave = async () => {
    if (!role?.id) return;
    setSaving(true);
    try {
      const menuIds = buildProposedIds(); // 不走 cleanPayload（[] = 清空，严禁洗成 null）
      const res = await assignMenus({ roleId: role.id, menuIds });
      message.success(res?.message || '授权成功');
      onSaved();
    } catch (e) {
      message.error((e as Error).message); // 失败透传
      // 调整：rejection 抛回 Modal.confirm（antd 捕获）→ 覆盖确认保持开启，失败不关闭
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => {
    if (!role?.id) return;
    if (!isChanged()) {
      message.info('授权未变更');
      return;
    }
    // 覆盖确认（含摘要计数，兜底提示）
    Modal.confirm({
      title: '覆盖确认',
      content: `本次将覆盖该角色的全部菜单权限，保存后共保留 ${selectedCount} 项（含三个应用与历史授权），是否继续？`,
      okText: '继续保存',
      cancelText: '再看看',
      onOk: () => doSave(),
    });
  };

  return (
    // DraggableModal：弹窗支持拖拽（对齐 RoleFormModal 工程约定）
    <DraggableModal
      title={`分配菜单：${role?.name ?? ''}`}
      open={open}
      onOk={handleSubmit}
      confirmLoading={saving}
      okButtonProps={{ disabled: saving }}
      okText="保存"
      onCancel={onClose}
      destroyOnClose
      width={880}
      centered
      styles={{ body: { maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' } }}
    >
      <div className="role-cascade-tip">
        勾选父级将包含其下所有子级；保存为全量覆盖，未勾选的菜单授权将被移除（含全部应用）。
      </div>
      {/* 左右双栏：左=页签+树（勾选操作），右=已选权限实时汇总（核对/移除） */}
      <div className="role-assign-body">
        <div className="role-assign-left">
          <div className="role-tree-toolbar">
            <Input
              allowClear
              className="role-tree-toolbar__search"
              placeholder="搜索当前应用菜单"
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
            <Tabs
              activeKey={String(activeTab)}
              onChange={(k) => {
                setActiveTab(Number(k)); // 切页签保留各端独立勾选/展开态
                setKeyword('');
              }}
              items={CLIENT_TABS.map((t) => ({
                key: String(t.key),
                label: t.label,
              }))}
              size="small"
            />
            <div className="role-tree-box role-tree-box--tabbed">
              {treeData.length > 0 ? (
                <Tree
                  checkable
                  checkStrictly={false} // 级联勾选（全量口径已与后端对齐，OPT-04 闭环）
                  selectable={false}
                  expandedKeys={displayExpanded}
                  onExpand={(keys) => {
                    if (!kw)
                      setExpandedMap((m) => ({ ...m, [activeTab]: keys }));
                  }}
                  treeData={treeData}
                  checkedKeys={checkedMap[activeTab] ?? []}
                  onCheck={(checked) => {
                    if (Array.isArray(checked))
                      setCheckedMap((m) => ({ ...m, [activeTab]: checked }));
                  }}
                />
              ) : (
                !loading && (
                  <div
                    style={{ textAlign: 'center', padding: 40, color: '#999' }}
                  >
                    {`${CLIENT_TABS.find((t) => t.key === activeTab)?.label ?? ''}暂无菜单数据`}
                    <div style={{ fontSize: 12, marginTop: 8 }}>
                      请检查菜单数据与 clientType 枚举配置
                    </div>
                  </div>
                )
              )}
            </div>
          </Spin>
        </div>

        {/* 右侧已选权限面板（实时联动，点击 Tag 可移除） */}
        <div className="role-assign-right">
          <div className="role-assign-right__title">
            已选权限
            <span className="role-assign-right__count">{selectedCount}</span>
          </div>
          <div className="role-assign-right__list">
            {selectedGroups.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="左侧勾选菜单后，此处实时汇总"
              />
            ) : (
              selectedGroups.map((g) => (
                <div key={g.client} className="role-assign-group">
                  <div className="role-assign-group__label">
                    {g.label}
                    <span className="role-assign-group__num">
                      {g.items.length}
                    </span>
                  </div>
                  <div className="role-assign-group__tags">
                    {g.items.map((it) => (
                      <Tooltip key={it.id} title="点击移除">
                        <Tag
                          className="role-assign-tag"
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
