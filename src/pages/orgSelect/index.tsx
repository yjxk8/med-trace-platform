/**
 * 机构选择页(§1-1/§8)
 * - empty 卡片禁点恢复(后端 P0-1 已修复,orgs[i].empty 与 org-context 恒一致)
 * - 选机构渲染优先用 login/me 的 orgs[i](login 恒实时;org-context 有 10min 内存缓存,仅作兜底)
 * - 写入 lastOrgId(§7 刷新恢复、T5)
 * - 保留右上角常驻退出(逃生门)
 */

import { BankOutlined, LogoutOutlined } from '@ant-design/icons';
import { history, useModel } from '@umijs/max';
import { Alert, App, Button, Card, Empty, Spin, Tag } from 'antd';
import { useState } from 'react';
import type { OrgContextVO, OrgItemVO } from '@/services/auth';
import { clearAuth, fetchOrgContext } from '@/services/auth';
import { setOrgId } from '@/utils/orgContext';
import { buildPermContext } from '@/utils/permission';

export default function OrgSelect() {
  const { message } = App.useApp();
  const { initialState, setInitialState } = useModel('@@initialState');
  const vo = (initialState as any)?.login;
  const orgs: OrgItemVO[] = vo?.orgs ?? [];
  const [switching, setSwitching] = useState<number | null>(null);
  const [err, setErr] = useState('');

  const doLogout = () => {
    clearAuth();
    history.replace('/login');
  };

  const handleSelect = async (item: OrgItemVO) => {
    const orgId = item.org.miId;
    setSwitching(orgId);
    setErr('');
    try {
      // §8:优先 orgs[i](登录时刻最新、完整上下文);内存没有才调 org-context
      let ctx = vo?.orgs?.find(
        (o: OrgItemVO) => o.org.miId === orgId,
      ) as unknown as OrgContextVO | undefined;
      if (!ctx) ctx = await fetchOrgContext(orgId);
      if (ctx.empty) {
        // 双保险(禁点已拦,此处防直连 URL)
        message.warning(`机构「${item.org.miName}」暂无配置`);
        setSwitching(null);
        return;
      }
      setOrgId(orgId); // X-Org-Id 保留写入(§8 已降级为可选审计头)
      localStorage.setItem('lastOrgId', String(orgId)); // §7/T5
      if (!ctx) {
        message.error('机构上下文缺失,请重试');
        return;
      }
      setInitialState((s: any) => ({
        ...s,
        perm: buildPermContext(vo, { ctx, orgId }),
      }));
      message.success(`已进入机构:${item.org.miName}`);
      const redirect = new URLSearchParams(window.location.search).get(
        'redirect',
      );
      history.replace(
        redirect?.startsWith('/') && !redirect.startsWith('//')
          ? redirect
          : '/welcome',
      );
    } catch (e) {
      setErr((e as Error).message);
      setSwitching(null);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
        position: 'relative',
      }}
    >
      <Button
        icon={<LogoutOutlined />}
        onClick={doLogout}
        style={{ position: 'absolute', top: 24, right: 24 }}
      >
        退出登录
      </Button>
      <div style={{ width: 720 }}>
        <h3 style={{ textAlign: 'center', marginBottom: 4 }}>
          选择要进入的机构
        </h3>
        <p style={{ textAlign: 'center', color: '#999', marginBottom: 16 }}>
          管理员模式下每次仅操作一个机构的数据；进入后可在顶栏切换
        </p>
        {err && (
          <Alert
            type="error"
            showIcon
            message={err}
            style={{ marginBottom: 12 }}
          />
        )}
        {!orgs.length ? (
          <div style={{ background: '#fff', padding: 32, borderRadius: 8 }}>
            <Empty description="当前账号无可选机构，请联系管理员分配" />
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Button icon={<LogoutOutlined />} onClick={doLogout}>
                退出登录
              </Button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
            }}
          >
            {orgs.map((item) => {
              const disabled = !!item.empty; // §1-1 恢复禁点
              const loading = switching === item.org.miId;
              return (
                <Card
                  key={item.org.miId}
                  hoverable={!disabled}
                  onClick={() => !disabled && !switching && handleSelect(item)}
                  style={{
                    opacity: disabled ? 0.5 : 1,
                    borderColor: loading ? '#1677ff' : undefined,
                  }}
                >
                  <Spin spinning={loading}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <BankOutlined
                        style={{ fontSize: 20, color: '#1677ff' }}
                      />
                      <span
                        style={{
                          fontWeight: 600,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.org.miName}
                      </span>
                      {disabled && <Tag>该机构暂无配置</Tag>} {/* §8 文案 */}
                    </div>
                    <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
                      代码:{item.org.miCode}
                    </div>
                  </Spin>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
