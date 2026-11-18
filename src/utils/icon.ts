// src/utils/icon.ts —— 菜单图标解析(仅 antd 图标名形态;老菜单 PNG 已随 id<2000 过滤下线,不再处理)
// 数据库约定:org_t_menu.logo 存 @ant-design/icons 的组件名,如 "HomeOutlined"、"TeamOutlined"
import {
  ApartmentOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  BookOutlined,
  ControlOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  FileDoneOutlined,
  FileProtectOutlined,
  HomeOutlined,
  IdcardOutlined,
  LinkOutlined,
  MedicineBoxOutlined,
  MenuOutlined,
  ProfileOutlined,
  QrcodeOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  SwapOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { createElement } from 'react';

/** 数据库图标名 → antd 组件(★后端新增图标名后,在此表补一行 + 跑自检 SQL 核对) */
export const MENU_ICON_MAP: Record<string, any> = {
  HomeOutlined,
  MedicineBoxOutlined,
  SwapOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  SettingOutlined,
  BookOutlined,
  WarningOutlined,
  FileDoneOutlined,
  LinkOutlined,
  IdcardOutlined,
  ProfileOutlined,
  QrcodeOutlined,
  SearchOutlined,
  ExperimentOutlined,
  UserOutlined,
  ApartmentOutlined,
  MenuOutlined,
  TeamOutlined,
  AppstoreOutlined,
  BankOutlined,
  ControlOutlined,
  AuditOutlined,
  SafetyCertificateOutlined,
  FileProtectOutlined, // ★201001~201003 新增
};

/**
 * logo 字符串 → 可渲染图标元素
 * - 规范名:"TeamOutlined" 直查
 * - 容错:缺后缀/小写("team")自动补 Outlined 并首字母大写
 * - 未收录:返回 undefined 且 console.warn 提示(方便发现 DB 新增了映射表没有的名字)
 */
export function iconOf(logo?: string | null) {
  if (!logo) return undefined;
  if (typeof logo === 'function') return createElement(logo as any); // 防御:静态路由直接传组件时
  const name = String(logo).trim();
  if (!name) return undefined;
  let key = name;
  if (!/(Outlined|Filled|TwoTone)$/.test(key)) {
    key = `${key.charAt(0).toUpperCase() + key.slice(1)}Outlined`;
  }
  const Comp = MENU_ICON_MAP[key];
  if (!Comp)
    console.warn(
      `[menu icon] 未收录图标名「${name}」→ 请补进 MENU_ICON_MAP 或修正 DB logo`,
    );
  return Comp ? createElement(Comp) : undefined;
}
