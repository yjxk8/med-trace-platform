/** C1b:notices 渲染。FORCE_PWD→强制改密弹窗(待 K7 字段/ChangePasswordModal C3 核对);
 *  PRES_AUTH_EXPIRE→常驻黄条。放 childrenRender 顶栏之下。 */

import { useModel } from '@umijs/max';
import { Alert } from 'antd';
import { useEffect } from 'react';
import { FORCE_PWD_FLAG } from '@/utils/permission';

export default function GlobalNotices() {
  const { initialState } = useModel('@@initialState');
  const vo = (initialState as any)?.login;
  const notices = vo?.notices ?? [];

  useEffect(() => {
    if (sessionStorage.getItem(FORCE_PWD_FLAG)) {
      sessionStorage.removeItem(FORCE_PWD_FLAG);
      // TODO(C3):确认 ChangePasswordModal 支持不可关闭(强制模式)后再放开
      // openChangePassword({ force: true });
    }
  }, []);

  const presExpire = notices.find((n: any) => n.code === 'PRES_AUTH_EXPIRE');
  if (!presExpire) return null;
  return (
    <Alert
      type="warning"
      showIcon
      banner
      message={presExpire.message || '您的处方权限即将到期，请及时完成资质续期'}
      style={{ marginBottom: 8 }}
    />
  );
}
