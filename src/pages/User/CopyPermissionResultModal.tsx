/**
 * 权限复制结果报告弹窗(§5.4)—— code===200 即开(部分成功也是成功)
 * 区块:汇总 → skipped 表 → 未复制关键角色 → 未复制已删部门 → warnings;
 * 空区块整体隐藏(??.length 判断);skipped.reason 直渲染不翻译;name=null → #userId 兜底(§6)
 */
import { Alert, Button, Table } from 'antd';
import DraggableModal from '@/components/DraggableModal';
import type { CopyPermissionResult } from '@/services/org/user';

interface Props {
  open: boolean;
  result: CopyPermissionResult | null;
  onClose: () => void;
}

export default function CopyPermissionResultModal({
  open,
  result,
  onClose,
}: Props) {
  const okCount = result?.successUserIds?.length ?? 0;
  const skipCount = result?.skipped?.length ?? 0;
  return (
    <DraggableModal
      title="复制结果报告"
      open={open}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          知道了
        </Button>
      }
      destroyOnHidden
      width={680}
      centered
    >
      <Alert
        type={skipCount > 0 ? 'warning' : 'success'}
        showIcon
        style={{ marginBottom: 12 }}
        message={`成功 ${okCount} 人${skipCount > 0 ? `，跳过 ${skipCount} 人` : ''}`}
      />

      {/* skipped:reason 直渲染;name null → #userId(§6) */}
      {skipCount > 0 && (
        <>
          <div style={{ fontWeight: 600, margin: '8px 0' }}>跳过的目标用户</div>
          <Table
            size="small"
            rowKey="userId"
            pagination={false}
            dataSource={result?.skipped}
            columns={[
              {
                title: '用户',
                dataIndex: 'name',
                width: 140,
                render: (_, r) => r.name ?? `#${r.userId}`,
              },
              { title: 'ID', dataIndex: 'userId', width: 100 },
              { title: '原因', dataIndex: 'reason' }, // 后端文案直渲染,不翻译不映射
            ]}
          />
        </>
      )}

      {/* 未复制关键角色(§3.4 文案) */}
      {!!result?.excludedCriticalRoles?.length && (
        <>
          <div style={{ fontWeight: 600, margin: '16px 0 8px' }}>
            未复制的关键角色（须走用户组授权通道）
          </div>
          <Table
            size="small"
            rowKey="roleId"
            pagination={false}
            dataSource={result.excludedCriticalRoles}
            columns={[
              { title: '角色ID', dataIndex: 'roleId', width: 100 },
              { title: '角色名', dataIndex: 'roleName' }, // 可能 "#5"(角色已删),直渲染
            ]}
          />
        </>
      )}

      {/* 未复制已删部门 */}
      {!!result?.excludedDeletedDepts?.length && (
        <>
          <div style={{ fontWeight: 600, margin: '16px 0 8px' }}>
            未复制的已删除部门
          </div>
          <Table
            size="small"
            rowKey="deptId"
            pagination={false}
            dataSource={result.excludedDeletedDepts}
            columns={[
              { title: '部门ID', dataIndex: 'deptId', width: 100 },
              { title: '部门名', dataIndex: 'deptName' },
            ]}
          />
        </>
      )}

      {/* warnings 逐条(§3.2/3.3/3.7 非阻断警示) */}
      {!!result?.warnings?.length && (
        <div style={{ marginTop: 16 }}>
          {result.warnings.map((w) => (
            <Alert
              key={w}
              type="warning"
              showIcon
              style={{ marginBottom: 8 }}
              message={w}
            />
          ))}
        </div>
      )}
    </DraggableModal>
  );
}
