// src/pages/Welcome/index.tsx
import { Card, Typography } from 'antd';

export default function Welcome() {
  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        麻精药品追溯管理平台
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        点击左侧菜单即可打开对应功能页签；页签支持切换与关闭，「首页」固定展示。
      </Typography.Paragraph>
    </Card>
  );
}
