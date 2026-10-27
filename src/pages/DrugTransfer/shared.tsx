/**
 * 出入库模块共享渲染：通用函数复用 drugStock 模块沉淀（单一来源，勿复制）
 * 本模块新增：方向/状态/打印徽标渲染（出入库特有语义）
 */
import { DoubleRightOutlined } from '@ant-design/icons';
import { Tag, Tooltip } from 'antd';

import {
  dash,
  expiryFlag,
  fmtDate,
  fmtFull,
  renderBatch,
  renderExpiry,
  truncateText,
} from '../drugStock/shared';

export {
  dash,
  expiryFlag,
  fmtDate,
  fmtFull,
  renderBatch,
  renderExpiry,
  truncateText,
};

/** 方向：入库=蓝 / 出库=橙（与状态色系分离，避免旧版「方向状态全绿」的混淆） */
export function renderDirection(v?: string | null) {
  if (v === '1') return <Tag color="blue">入库</Tag>;
  if (v === '0') return <Tag color="orange">出库</Tag>;
  return dash(v);
}

/** 单据状态：'1' 保存→待确认（橙）；'2' 提交→已提交（绿）。不渲染「已入库/已出库」——那是方向语义 */
export function renderDocStatus(v?: string | null) {
  if (v === '1') return <Tag color="orange">待确认</Tag>;
  if (v === '2') return <Tag color="green">已提交</Tag>;
  return dash(v);
}

/** 打印徽标：'2' → 已打印×N（printCount 后端累加，坑#7 打印后须刷新才可见） */
export function renderPrintBadge(
  printStatus?: string | null,
  printCount?: number | null,
) {
  if (printStatus !== '2') return null;
  return <Tag>已打印{printCount ? ` ×${printCount}` : ''}</Tag>;
}

/** 库房流向单元格：按方向显示对应库房，悬停显双方全名 */
export function renderCounterparty(
  ioDirection: string | undefined,
  inName?: string | null,
  outName?: string | null,
) {
  const isIn = ioDirection === '1';
  const name = isIn ? inName : outName;
  return (
    <Tooltip title={`收 ${dash(inName)} · 发 ${dash(outName)}`}>
      <span style={{ cursor: 'default' }}>{dash(name)}</span>
    </Tooltip>
  );
}
/** HIS 扩展单-单据状态：'0' 待办（橙）/ '1' 已办（绿） */
export function renderExtendStatus(v?: string | null) {
  if (v === '0') return <Tag color="orange">待办</Tag>;
  if (v === '1') return <Tag color="green">已办</Tag>;
  return dash(v);
}

/** HIS 扩展单-验收状态（坑#12：数字枚举，勿与中文 operationType 混淆） */
export function renderCheckStatus(v?: number | null) {
  const map: Record<number, { label: string; color: string }> = {
    0: { label: '待处理', color: 'orange' },
    1: { label: '已处理', color: 'green' },
    2: { label: '验收失败', color: 'red' },
    3: { label: '待认证', color: 'blue' },
  };
  const it = v != null ? map[v] : undefined;
  return it ? (
    <Tag color={it.color}>{it.label}</Tag>
  ) : (
    dash(v == null ? null : String(v))
  );
}

/** HIS 扩展单-方向（中文枚举，坑#12）：与本地单 renderDirection（'1'/'0'）值域不同，勿混用 */
export function renderExtendOperation(v?: string | null) {
  if (v === '入库') return <Tag color="blue">入库</Tag>;
  if (v === '出库') return <Tag color="orange">出库</Tag>;
  return dash(v);
}
// ==================== 新建单据共享件（自 index.tsx 下沉） ====================

/** 出入库类型字典 YN0.2.14 —— ⚠️ 值域待后端补充（§6.7-2）。填充后：列表类型列/详情/新建「单据类型」字段自动出中文 */
export const IO_TYPE_LABELS: Record<string, string> = {};

/**
 * 流向对照卡：左=出库方（发货）→ 右=入库方（收货）
 * 药品物理流向与单据方向无关，固定左出右入，一眼看清「从哪里出库、到哪里入库」
 * （详情抽屉 / 新建单据两处复用）
 */
export function FlowCard({
  outName,
  inName,
}: {
  outName?: string | null;
  inName?: string | null;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #f0f0f0',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          flex: 1,
          padding: '12px 16px',
          textAlign: 'center',
          background: '#fff7e6',
        }}
      >
        <Tag color="orange" style={{ marginBottom: 4 }}>
          出库
        </Tag>
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            lineHeight: '22px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={outName ?? ''}
        >
          {dash(outName)}
        </div>
        <div style={{ fontSize: 12, color: '#8c8c8c' }}>发货方（出库库房）</div>
      </div>
      <div
        style={{
          width: 110,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafafa',
        }}
      >
        <DoubleRightOutlined style={{ fontSize: 22, color: '#1677ff' }} />
        <span style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
          药品流向
        </span>
      </div>
      <div
        style={{
          flex: 1,
          padding: '12px 16px',
          textAlign: 'center',
          background: '#e6f4ff',
        }}
      >
        <Tag color="blue" style={{ marginBottom: 4 }}>
          入库
        </Tag>
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            lineHeight: '22px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={inName ?? ''}
        >
          {dash(inName)}
        </div>
        <div style={{ fontSize: 12, color: '#8c8c8c' }}>收货方（入库库房）</div>
      </div>
    </div>
  );
}
