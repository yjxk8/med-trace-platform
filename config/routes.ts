/**
 * 毒麻精药品追溯管理平台 · 路由配置
 * 已清除 Ant Design Pro 脚手架演示路由（dashboard/form/list/profile/result/
 * exception/account/chatbot/admin/user），后续按模块逐步加回：
 *   库存预警 / 手术药箱 / 交接记录 / 患者管理 / 统计报表 / 处方审核
 */
export default [
  // 登录页：必须 layout:false，否则会被 ProLayout 包裹、守卫逻辑错乱
  {
    path: '/login',
    layout: false,
    component: './Login',
  },

  // ── 业务模块 ────────────────────────────────────────────
  {
    path: '/drug-transfer',
    name: '出入库管理',
    icon: 'swap',
    component: './DrugTransfer',
  },
  {
    path: '/dept',
    name: '部门管理',
    icon: 'team',
    component: './Dept',
  },

  // 根路径 → 默认业务首页（登录后 history.push 的也是这里）
  {
    path: '/',
    redirect: '/drug-transfer',
  },

  // 兜底 404：必须放数组最后
  {
    path: '*',
    component: './exception/404',
  },
];
