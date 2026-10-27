// src/utils/icon.ts
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BankOutlined,
  BarChartOutlined,
  BookOutlined,
  ControlOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  FileDoneOutlined,
  HomeOutlined,
  IdcardOutlined,
  LinkOutlined,
  MedicineBoxOutlined,
  MenuOutlined,
  ProfileOutlined,
  QrcodeOutlined,
  SearchOutlined,
  SettingOutlined,
  SwapOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';

/**
 * 菜单图标名 → 组件引用。
 * 只存组件引用，由 app.tsx 的 transformMenu 在渲染时 createElement 实例化，
 * 保证本文件保持 .ts（无 JSX）且单一遍历完成 key 注入 + 图标挂载。
 */
export const MENU_ICON_MAP: Record<string, any> = {
  HomeOutlined,
  WarningOutlined,
  BookOutlined,
  FileDoneOutlined,
  BankOutlined,
  ControlOutlined,
  SwapOutlined,
  DatabaseOutlined,
  LinkOutlined,
  MedicineBoxOutlined,
  IdcardOutlined,
  ProfileOutlined,
  QrcodeOutlined,
  SearchOutlined,
  ExperimentOutlined,
  MenuOutlined,
  UserOutlined,
  BarChartOutlined,
  ApartmentOutlined,
  TeamOutlined,
  SettingOutlined,
  AppstoreOutlined,
};
