// src/utils/icon.ts

import {
  ApartmentOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  FileDoneOutlined,
  HomeOutlined,
  IdcardOutlined,
  MedicineBoxOutlined,
  ProfileOutlined,
  QrcodeOutlined,
  SearchOutlined,
  SettingOutlined,
  SwapOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';
import { createElement } from 'react';

const ICON_MAP: Record<string, ComponentType> = {
  HomeOutlined,
  AppstoreOutlined,
  WarningOutlined,
  FileDoneOutlined,
  SwapOutlined,
  DatabaseOutlined,
  UserOutlined,
  BarChartOutlined,
  SettingOutlined,
  ApartmentOutlined,
  MedicineBoxOutlined,
  IdcardOutlined,
  ProfileOutlined,
  QrcodeOutlined,
  SearchOutlined,
  ExperimentOutlined,
};

/** 把路由里的 icon 字符串转成 antd 图标节点 */
export function toIcon(name?: string | React.ReactNode): React.ReactNode {
  if (!name || typeof name !== 'string') return name ?? null;
  const Cmp = ICON_MAP[name];
  return Cmp ? createElement(Cmp) : null;
}

/** menuDataRender 用：递归把菜单树里的字符串 icon 全部转换 */
export function withIcons(menuData: any[] = []): any[] {
  return menuData.map((item) => ({
    ...item,
    icon: toIcon(item.icon),
    children: item.children ? withIcons(item.children) : undefined,
  }));
}
