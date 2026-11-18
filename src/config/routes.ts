// config/routes.ts
export interface RouteItem {
  path?: string;
  /** ★ 仅菜单展示用的分组 key：不参与路由、不能与业务路由重名；分组节点不要写 path */
  menuPath?: string;
  name?: string;
  icon?: string;
  component?: string;
  redirect?: string;
  layout?: boolean; // false 表示该页脱离 ProLayout 布局
  routes?: RouteItem[];
  children?: RouteItem[];
}

export const routes: RouteItem[] = [
  { path: '/', redirect: '/welcome' },
  { path: '/login', name: '登录', layout: false, component: './Login' },
  // ★2026-11-17 强制改密页:★不走 layout:false——路由仍进布局,改密闸门由
  // app.tsx layout.childrenRender 渲染级接管(loginStatus=3 时菜单不渲染、
  // children 一律替换为改密表单,业务组件不挂载零请求,换 URL 绕不过);
  // 不写 name(不进静态菜单);非改密期直接访问时由组件自身守卫送回 /
  { path: '/force-change-pwd', component: './User/ForceChangePwd' },
  { path: '/org-select', component: '@/pages/orgSelect' },
  {
    path: '/welcome',
    name: '首页',
    icon: 'HomeOutlined',
    component: './Welcome',
  },
  // ===== 药事管理 =====
  {
    name: '药事管理',
    menuPath: '/group/pharmacy',
    icon: 'MedicineBoxOutlined',
    routes: [
      {
        path: '/drug-infos',
        name: '药品字典',
        icon: 'BookOutlined',
        component: './DrugInfos',
      },
      {
        path: '/stock-warning',
        name: '药品库存预警',
        icon: 'WarningOutlined',
        component: './Placeholder',
      },
      {
        path: '/prescription',
        name: '处方审核',
        icon: 'FileDoneOutlined',
        component: './Placeholder',
      },
    ],
  },
  // ===== 业务办理 =====
  {
    name: '业务办理',
    menuPath: '/group/business',
    icon: 'SwapOutlined',
    routes: [
      {
        path: '/drug-transfer',
        name: '药库出入库',
        icon: 'DatabaseOutlined',
        component: './DrugTransfer',
      },
      {
        path: '/his-extend',
        name: 'HIS 扩展单',
        icon: 'LinkOutlined',
        component: './Placeholder',
      },
      {
        path: '/handover',
        name: '交接记录',
        icon: 'SwapOutlined',
        component: './Placeholder',
      },
    ],
  },
  // ===== 三级药库 =====
  {
    name: '三级药库',
    menuPath: '/group/storage',
    icon: 'DatabaseOutlined',
    routes: [
      {
        path: '/dispense-record',
        name: '取药记录',
        icon: 'MedicineBoxOutlined',
        component: './Placeholder',
      },
      {
        path: '/seal-card',
        name: '印鉴卡管理',
        icon: 'IdcardOutlined',
        component: './Placeholder',
      },
      {
        path: '/dept-attr',
        name: '科室属性管理',
        icon: 'ProfileOutlined',
        component: './Placeholder',
      },
      {
        path: '/code-platform',
        name: '赋码平台',
        icon: 'QrcodeOutlined',
        component: './Placeholder',
      },
      {
        path: '/stock-query',
        name: '库存查询',
        icon: 'SearchOutlined',
        component: './drugStock',
      },
      {
        path: '/surgery-box',
        name: '手术药箱',
        icon: 'ExperimentOutlined',
        component: './Placeholder',
      },
    ],
  },
  // ===== 溯源与统计 =====
  {
    name: '溯源与统计',
    menuPath: '/group/trace',
    icon: 'BarChartOutlined',
    routes: [
      {
        path: '/patient',
        name: '患者管理',
        icon: 'UserOutlined',
        component: './Placeholder',
      },
      {
        path: '/report',
        name: '统计报表',
        icon: 'BarChartOutlined',
        component: './Placeholder',
      },
    ],
  },
  // ===== 系统管理 =====
  {
    name: '系统管理',
    menuPath: '/group/system',
    icon: 'SettingOutlined',
    routes: [
      {
        path: '/dept',
        name: '部门管理',
        icon: 'ApartmentOutlined',
        component: './Dept',
      },
      {
        path: '/system/menu',
        name: '菜单管理',
        icon: 'MenuOutlined',
        component: './Menu',
      },
      {
        path: '/org/user-group',
        name: '用户组管理',
        icon: 'TeamOutlined',
        component: './UserGroup',
      },
      // ↓ 占位路由（P0.5/P1 交付后替换 component），与列表页同级并列
      {
        path: '/org/compliance/confirm',
        name: '合规确认待办',
        component: './UserGroup/ComplianceConfirm',
      },
      {
        path: '/org/audit/auth',
        name: '授权审计',
        component: './UserGroup/AuditAuth',
      },
      {
        path: '/org/perm-template',
        name: '权限模板',
        component: './UserGroup/placeholder',
      }, // P1 保留占位
      {
        path: '/system/role',
        name: '角色管理',
        icon: 'TeamOutlined',
        component: './Role',
      },
      {
        path: '/user',
        name: '用户管理',
        icon: 'TeamOutlined',
        component: './User',
      },
      {
        path: '/dict',
        name: '字典管理',
        icon: 'AppstoreOutlined',
        component: './Dict',
      },
      {
        path: '/org/mi',
        name: '机构管理',
        icon: 'BankOutlined',
        component: './Mi',
      },
      {
        path: '/mi-config',
        name: '机构参数配置',
        icon: 'ControlOutlined',
        component: './MiConfig',
      },
      {
        path: '/system',
        name: '系统设置',
        icon: 'SettingOutlined',
        component: './Placeholder',
      },
    ],
  },
];

/** 按 path 查菜单节点（页签、面包屑共用） */
export function findMenuNode(
  pathname: string,
  list: RouteItem[] = routes,
): RouteItem | undefined {
  for (const item of list) {
    if (item.path === pathname) return item;
    const children = item.routes || item.children;
    if (children) {
      const found = findMenuNode(pathname, children);
      if (found) return found;
    }
  }
  return undefined;
}

/** ★ 按叶子 path 反查所属分组的 menuPath（手风琴自动展开用） */
export function findGroupPathByLeaf(
  pathname: string,
  list: RouteItem[] = routes,
): string | undefined {
  for (const item of list) {
    if ((item.routes ?? item.children)?.some((c) => c.path === pathname)) {
      return item.menuPath;
    }
  }
  return undefined;
}
