// src/components/FillTable/index.tsx

import { ProTable } from '@ant-design/pro-components';
import { Table } from 'antd';
import { useEffect, useRef, useState } from 'react';

type FillTableProps = {
  reservedHeight?: number;
  pro?: boolean;
} & Record<string, any>;

const PRO_RESERVED = 148; // 工具栏(收紧后) + 表头 + 分页
const TABLE_RESERVED = 96;

/** 单元格密度收紧：行高 ≈ 45px，保证一屏能放下 10 行以上 */
const DENSITY_CSS = `
.fill-table .ant-table-thead>tr>th{padding-top:10px;padding-bottom:10px;}
.fill-table .ant-table-tbody>tr>td{padding-top:10px;padding-bottom:10px;}
.fill-table .ant-table-pagination.ant-pagination{margin:10px 0 2px;}
.fill-table .ant-pro-table-toolbar{margin-bottom:8px;}
`;

const FillTable: React.FC<FillTableProps> = ({
  reservedHeight,
  pro,
  ...tableProps
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxH, setBoxH] = useState(300);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setBoxH(e.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reserve = reservedHeight ?? (pro ? PRO_RESERVED : TABLE_RESERVED);
  const scrollY = Math.max(boxH - reserve, 120);
  const Tbl: any = pro ? ProTable : Table;

  return (
    <div ref={boxRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <style>{DENSITY_CSS}</style>
      <div className="fill-table" style={{ height: '100%' }}>
        <Tbl
          {...tableProps}
          ghost={pro ? true : undefined}
          scroll={{ ...((tableProps.scroll as any) ?? {}), y: scrollY }}
        />
      </div>
    </div>
  );
};

export default FillTable;
