// src/pages/Placeholder/index.tsx
import { Card, Result } from 'antd';

export default function Placeholder() {
  return (
    <Card>
      <Result
        status="info"
        title="功能建设中"
        subTitle="该模块在后续迭代中实现。"
      />
    </Card>
  );
}
