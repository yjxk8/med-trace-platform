/**
 * 占位页（组授权绑定 / 合规确认待办 / 授权审计 / 权限模板 4 路由共用）
 * 对应能力封存：④组↔角色绑定 ⑤合规确认单 ⑥授权审计 / 模板（P1）
 */
import { Result } from 'antd';

export default function Placeholder() {
  return (
    <Result
      status="info"
      title="功能建设中"
      subTitle="该能力待后端 P0.5 / P1 交付后开放（组授权绑定、合规确认、授权审计、权限模板）"
    />
  );
}
