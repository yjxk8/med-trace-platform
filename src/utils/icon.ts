// src/utils/icon.ts
import {
  ApartmentOutlined,
  BarChartOutlined,
  BookOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  FileDoneOutlined,
  HomeOutlined,
  IdcardOutlined,
  LinkOutlined,
  MedicineBoxOutlined,
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
  SwapOutlined,
  DatabaseOutlined,
  LinkOutlined,
  MedicineBoxOutlined,
  IdcardOutlined,
  ProfileOutlined,
  QrcodeOutlined,
  SearchOutlined,
  ExperimentOutlined,
  UserOutlined,
  BarChartOutlined,
  ApartmentOutlined,
  TeamOutlined,
  SettingOutlined,
};
