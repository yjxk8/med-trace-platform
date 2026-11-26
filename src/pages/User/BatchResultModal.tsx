/**
 * 批量操作结果弹窗(部分成功模式统一展示)
 * 三区:成功计数 / 非阻断警示 / 跳过明细(人 + 原因);关闭回调由父级刷新 + 清选中
 */
import { CheckCircleOutlined } from '@ant-design/icons';
import { Alert, Modal, Tag } from 'antd';
import type { BatchOpResult } from '@/services/org/user';

interface Props {
  open: boolean;
  title: string;
  result: BatchOpResult | null;
  onClose: () => void;
}

export default function BatchResultModal({
  open,
  title,
  result,
  onClose,
}: Props) {
  const okCount = result?.successUserIds.length ?? 0;
  const skipped = result?.skipped ?? [];
  const warnings = result?.warnings ?? [];
  return (
    <Modal
      title={title}
      open={open}
      onOk={onClose}
      onCancel={onClose}
      okText="知道了"
      cancelButtonProps={{ style: { display: 'none' } }}
      width={560}
      centered
      destroyOnClose
    >
      {result && (
        <>
          <div style={{ marginBottom: 12, fontSize: 14 }}>
            <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />
            成功 <b>{okCount}</b> 名
            {skipped.length > 0 && (
              <span>
                ;跳过 <b style={{ color: '#faad14' }}>{skipped.length}</b> 名
              </span>
            )}
          </div>
          {warnings.map((w, i) => (
            <Alert
              key={w}
              type="warning"
              showIcon
              message={w}
              style={{ marginBottom: 8 }}
            />
          ))}
          {skipped.length > 0 && (
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {skipped.map((s) => (
                <div
                  key={String(s.userId)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 0',
                  }}
                >
                  <Tag
                    color="orange"
                    style={{ marginInlineEnd: 0, flexShrink: 0 }}
                  >
                    {s.name ?? `#${s.userId}`}
                  </Tag>
                  <span style={{ color: '#595959', fontSize: 12 }}>
                    {s.reason}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
