/**
 * 库存统计四指标卡片（图标横版，样式与「药库出入库」页 KPI 卡一致）
 * 结构：彩色圆角图标块 + 大数字 + 灰色标题（含口径 tooltip）
 *
 * 口径说明（写进 tooltip，防止用户误解）：
 * - 后端 stats 接口只认 miId + pharmacyCode 两个过滤条件，
 *   其余筛选（drugCode/批次/有效期等）不影响卡片数字
 * - nearExpiry：now ~ now+30 天，2099 长期天然排除；阈值待业务确认（遗留待办 #3）
 * - 库存总量是所有在库记录求和，含 0 库存记录（与列表红线一致：0 是合法值）
 *
 * 隔离原则：stats 失败只影响卡片区（内联 Alert + 重试），不影响表格、不弹全局错误
 */

import {
  AppstoreOutlined,
  DatabaseOutlined,
  MedicineBoxOutlined,
  QuestionCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, Button, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import {
  type DrugStockStats,
  getDrugStockStats,
} from '@/services/inv/drugStock';

const nf = new Intl.NumberFormat('zh-CN');

interface Props {
  /** 查询/重置时提交的 pharmacyCode（stats 唯一支持的筛选口径） */
  pharmacyCode?: string;
  /** 刷新计数器：每次提交查询 +1，即使 pharmacyCode 未变也重拉 */
  refreshKey: number;
}

export default function StatsCards({ pharmacyCode, refreshKey }: Props) {
  const [data, setData] = useState<DrugStockStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadFlag, setReloadFlag] = useState(0);

  useEffect(() => {
    let cancelled = false; // 竞态守卫：连续刷新时丢弃过期响应
    setError(null);
    setLoading(true);
    getDrugStockStats(pharmacyCode ? { pharmacyCode } : {})
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (cancelled) return;
        setData(null);
        setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pharmacyCode, refreshKey, reloadFlag]);

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        style={{ flexShrink: 0 }}
        message="库存统计加载失败"
        description={error}
        action={
          <Button
            size="small"
            danger
            onClick={() => setReloadFlag((n) => n + 1)}
          >
            重试
          </Button>
        }
      />
    );
  }

  const items: {
    title: string;
    value?: number;
    tip: string;
    icon: React.ReactNode;
    bg: string;
    warn?: boolean;
  }[] = [
    {
      title: '品种数',
      value: data?.drugKindsCount,
      tip: '去重药品编码（drug_code）计数',
      icon: <AppstoreOutlined />,
      bg: '#1677ff',
    },
    {
      title: '库存总量',
      value: data?.totalInventory,
      tip: '在库记录 current_inventory 求和（含 0 库存记录）',
      icon: <DatabaseOutlined />,
      bg: '#16a34a',
    },
    {
      title: '30天内临期品种',
      value: data?.nearExpiryKindsCount,
      tip: '有效期距今 ≤30 天的品种数；长期（2099）已排除；阈值待业务确认',
      icon: <WarningOutlined />,
      bg: '#fa8c16',
      warn: true,
    },
    {
      title: '药箱记录数',
      value: data?.medicineBoxRecordCount,
      tip: "is_medicine_box='1' 的在库记录条数",
      icon: <MedicineBoxOutlined />,
      bg: '#722ed1',
    },
  ];

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
      {items.map((it) => (
        <div
          key={it.title}
          style={{
            flex: '1 1 220px',
            minWidth: 220,
            background: '#fff',
            borderRadius: 8,
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: it.bg,
              color: '#fff',
              fontSize: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {it.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                lineHeight: 1.2,
                color: it.warn && (it.value ?? 0) > 0 ? '#d46b08' : undefined,
              }}
            >
              {loading ? '--' : nf.format(it.value ?? 0)}
            </div>
            <div
              style={{ color: '#8c8c8c', fontSize: 13, whiteSpace: 'nowrap' }}
            >
              {it.title}
              <Tooltip title={it.tip}>
                <QuestionCircleOutlined
                  style={{ marginLeft: 4, fontSize: 11, color: '#c0c0c0' }}
                />
              </Tooltip>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
