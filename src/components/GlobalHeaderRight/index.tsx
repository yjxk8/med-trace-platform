// src/components/GlobalHeaderRight/index.tsx

import { BellOutlined } from '@ant-design/icons';
import { Badge } from 'antd';

export default function GlobalHeaderRight() {
  return (
    <div style={{ padding: '0 8px' }}>
      <Badge count={3} size="small">
        <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
      </Badge>
    </div>
  );
}
