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
        component: './Placeholder',
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
        path: '/user',
        name: '用户管理',
        icon: 'TeamOutlined',
        component: './Placeholder',
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
