/**
 * 分配菜单弹窗 —— 契约：角色管理 v1.0 §2.2/§6.4/§7
 * - 数据源：GET /menu/tree（clientType=1平台Web & status=1正常，§7 建议参数）
 *   + GET /role/{id}/menus 回显；复用菜单模块 service（契约唯一来源）
 * - 级联勾选（checkStrictly=false）：回显只勾「已授权的叶子」，父节点勾选/半选态
 *   由 antd 级联推导——直接把后端返回的父 id 塞 checkedKeys 会放大勾选范围
 * - ⚠️ 全量覆盖语义（§6.4）：提交 = checked ∪ halfChecked ∪ 树外保留 id。
 *    树外保留 id = 原授权中不在当前树内的节点（如已停用菜单、其他端菜单）——
 *    否则全量覆盖会把这部分历史授权意外清空（status=1 过滤树的副作用）
 * - menuIds=[] = 清空（§6.4）；严禁为 null（后端报错「不能为 null」）
 * - 父子级联规则【待产品确认】：当前按级联实现；若产品要求父子解绑，改 checkStrictly=true
 */
import { App, Modal, Spin, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { Key } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  CLIENT_TYPE,
  getMenuTree,
  MENU_STATUS,
  type MenuTreeVO,
} from '@/services/org/menu';
import { assignMenus, getRoleMenuIds, type RoleVO } from '@/services/org/role';

interface Props {
  open: boolean;
  role: RoleVO | null;
  onClose: () => void;
  onSaved: () => void;
}

/** 菜单树 → antd Tree DataNode（叶子空数组 → undefined，防空展开箭头） */
function toData(nodes: MenuTreeVO[]): DataNode[] {
  return nodes.map((n) => ({
    key: n.id,
    title: n.name,
    children: n.children?.length ? toData(n.children) : undefined,
  }));
}

/** 收集树内全部节点 id（判断「树外保留 id」用） */
function collectAllIds(
  nodes: MenuTreeVO[],
  acc: Set<number> = new Set(),
): Set<number> {
  nodes.forEach((n) => {
    acc.add(n.id);
    if (n.children?.length) collectAllIds(n.children, acc);
  });
  return acc;
}

/** 只勾「已授权的叶子」：父节点状态交由 antd 级联推导，避免父 id 回显放大勾选范围 */
function collectGrantedLeafIds(
  nodes: MenuTreeVO[],
  granted: Set<number>,
  acc: Key[] = [],
): Key[] {
  nodes.forEach((n) => {
    if (n.children?.length) {
      collectGrantedLeafIds(n.children, granted, acc);
    } else if (granted.has(n.id)) {
      acc.push(n.id);
    }
  });
  return acc;
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
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<Key[]>([]);
  const [halfCheckedKeys, setHalfCheckedKeys] = useState<Key[]>([]);
  /** 树外保留 id：原授权中不在当前树（停用/他端菜单），全量覆盖时原样带回 */
  const preservedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!open || !role?.id) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      getMenuTree({ clientType: CLIENT_TYPE.WEB, status: MENU_STATUS.NORMAL }),
      getRoleMenuIds(role.id),
    ])
      .then(([tree, menuIds]) => {
        if (!alive) return;
        const granted = new Set<number>(menuIds ?? []);
        const inTree = collectAllIds(tree);
        preservedRef.current = new Set(
          [...granted].filter((id) => !inTree.has(id)),
        );
        setTreeData(toData(tree));
        setCheckedKeys(collectGrantedLeafIds(tree, granted));
        setHalfCheckedKeys([]);
      })
      .catch((e) => message.error((e as Error).message))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, role?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!role?.id) return;
    setSaving(true);
    try {
      // 全量覆盖：勾选 ∪ 半选（父节点）∪ 树外保留，去重后提交
      const menuIds = Array.from(
        new Set<number>([
          ...checkedKeys.map(Number),
          ...halfCheckedKeys.map(Number),
          ...preservedRef.current,
        ]),
      );
      const res = await assignMenus({ roleId: role.id, menuIds });
      message.success(res?.message || '授权成功');
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`分配菜单：${role?.name ?? ''}`}
      open={open}
      onOk={submit}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnClose
      width={480}
      centered
      okText="授 权"
      styles={{ body: { maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' } }}
    >
      <div style={{ color: '#999', fontSize: 12, marginBottom: 10 }}>
        授权为全量覆盖：仅保留勾选菜单，未勾选的将被移除；空勾选提交 =
        清空该角色全部授权。 已停用菜单的历史授权会自动保留。
      </div>
      <Spin spinning={loading}>
        <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
          {treeData.length > 0 ? (
            <Tree
              checkable
              checkStrictly={false} // 级联勾选【待产品确认父子是否解绑】
              defaultExpandAll
              treeData={treeData}
              checkedKeys={checkedKeys}
              onCheck={(checked, info) => {
                setCheckedKeys(
                  Array.isArray(checked) ? checked : checked.checked,
                );
                setHalfCheckedKeys((info.halfCheckedKeys ?? []) as Key[]);
              }}
            />
          ) : (
            !loading && (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                暂无平台Web可用菜单
              </div>
            )
          )}
        </div>
      </Spin>
    </Modal>
  );
}
