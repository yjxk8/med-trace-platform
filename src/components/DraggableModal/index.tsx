/**
 * 可拖拽 Modal（按住标题栏移动，零第三方依赖）
 * 位移算法：next = base + (current - start)，绝对式计算，无累加误差；
 * 钳制基于「拖拽起点时的矩形」，保证弹窗始终留在视口内（8px 边距）
 * 关闭后重新打开自动复位；仅标题栏响应拖拽，表单/按钮不受影响
 */
import { Modal, type ModalProps } from 'antd';
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

/** 拖拽状态快照：起点坐标 + 拖拽开始时的位移 + 起点时的弹窗矩形 */
type DragState = {
  startX: number;
  startY: number;
  base: { x: number; y: number };
  rect: DOMRect;
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), Math.max(min, max));

export default function DraggableModal(props: ModalProps) {
  const { open, children, ...rest } = props;
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset); // 镜像 state：pointerdown 时读最新值，规避闭包过期
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  // 每次打开复位到默认位置
  useEffect(() => {
    if (open) {
      const reset = { x: 0, y: 0 };
      offsetRef.current = reset;
      setOffset(reset);
    }
  }, [open]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    // 仅标题栏可拖拽：避开输入框、按钮、右上角关闭图标
    if (!t.closest('.ant-modal-header')) return;
    const el = wrapRef.current;
    if (!el) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      base: { ...offsetRef.current }, // 起点时的既有位移
      rect: el.getBoundingClientRect(), // 起点时的屏幕矩形（已含位移）
    };
    el.setPointerCapture(e.pointerId); // 拖出弹窗范围也持续接收 move 事件
    document.body.style.userSelect = 'none';
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // ★ 修复点：以「起点位移 + 本次总位移」绝对计算，不再往 prev 上累加
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const nx = clamp(dx, 8 - d.rect.left, window.innerWidth - 8 - d.rect.right);
    const ny = clamp(
      dy,
      8 - d.rect.top,
      window.innerHeight - 8 - d.rect.bottom,
    );
    const next = { x: d.base.x + nx, y: d.base.y + ny };
    offsetRef.current = next;
    setOffset(next);
  };

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (drag.current && el?.hasPointerCapture?.(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
    document.body.style.userSelect = '';
  };

  return (
    <Modal
      open={open}
      {...rest}
      modalRender={(modal) => (
        <div
          ref={wrapRef}
          className="dm-draggable-modal"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <style>{`.dm-draggable-modal .ant-modal-header{cursor:move;user-select:none;touch-action:none;}`}</style>
          {modal}
        </div>
      )}
    >
      {children}
    </Modal>
  );
}
