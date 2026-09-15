// config/routes.ts
export interface RouteItem {
  path?: string;
  name?: string;
  icon?: string;
  component?: string;
  redirect?: string;
  layout?: boolean; // ← 新增：false 表示该页脱离 ProLayout 布局
  routes?: RouteItem[];
  children?: RouteItem[];
}

export const routes: RouteItem[] = [
  { path: '/', redirect: '/welcome' },
  { path: '/login', name: '登录', layout: false, component: './Login' }, // ← 新增
  {
    path: '/welcome',
    name: '首页',
    icon: 'HomeOutlined',
    component: './Welcome',
  },

  // ===== 功能导航 =====
  {
    name: '功能导航',
    icon: 'AppstoreOutlined',
    routes: [
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
      {
        path: '/handover',
        name: '交接记录',
        icon: 'SwapOutlined',
        component: './Placeholder',
      },
      {
        path: '/drug-transfer',
        name: '药库出入库',
        icon: 'DatabaseOutlined',
        component: './DrugTransfer',
      },
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
      {
        path: '/system',
        name: '系统设置',
        icon: 'SettingOutlined',
        component: './Placeholder',
      },
      {
        path: '/dept',
        name: '部门管理',
        icon: 'ApartmentOutlined',
        component: './Dept',
      },
    ],
  },

  // ===== 三级药库 =====
  {
    name: '三级药库',
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
