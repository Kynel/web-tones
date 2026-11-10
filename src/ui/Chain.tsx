import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BUILTIN_CAB_IRS, BUILTIN_MODELS, type AssetEntry } from '../audio/assets';
import { EFFECT_BY_TYPE } from '../audio/effects';
import type { Block, BlockStatus } from '../audio/types';
import { useStore } from '../state/store';

/** Second line of a tile: which capture / IR / mode the block is using. */
export function blockSubtitle(b: Block, userAssets: AssetEntry[]): string {
  const find = (list: AssetEntry[], id: unknown) => [...list, ...userAssets].find((a) => a.id === id)?.name ?? '';
  if (b.type === 'nam') return find(BUILTIN_MODELS, b.params.model);
  if (b.type === 'cab') return find(BUILTIN_CAB_IRS, b.params.ir);
  const def = EFFECT_BY_TYPE[b.type];
  const sel = def?.params.find((p) => p.kind === 'select' && (p.id === 'space' || p.id === 'mode'));
  if (sel?.kind === 'select') return sel.options.find((o) => o.value === b.params[sel.id])?.label.replace(/ \(.*\)/, '') ?? '';
  return '';
}

function Tile({ block, selected, status }: { block: Block; selected: boolean; status?: BlockStatus }) {
  const def = EFFECT_BY_TYPE[block.type];
  const select = useStore((s) => s.select);
  const toggle = useStore((s) => s.toggleBlock);
  const userAssets = useStore((s) => s.userAssets);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const sub = blockSubtitle(block, userAssets);
  return (
    <div
      ref={setNodeRef}
      className="tile"
      data-cat={def.category}
      data-selected={selected || undefined}
      data-off={!block.enabled || undefined}
      data-dragging={isDragging || undefined}
      data-error={status?.error ? true : undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      role="button"
      aria-pressed={selected}
      aria-label={`${def.name}${sub ? ` — ${sub}` : ''}${block.enabled ? '' : ' (바이패스)'}`}
      onClick={() => select(block.id)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === 'Enter') select(block.id);
      }}
    >
      <button
        className="led"
        aria-label={block.enabled ? `${def.name} 끄기` : `${def.name} 켜기`}
        aria-pressed={block.enabled}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          toggle(block.id);
        }}
      />
      <div className="tile-short">{def.short}</div>
      <div className="tile-name">{def.name}</div>
      <div className="tile-sub">{status?.loading ? '로딩 중…' : status?.error ? '오류' : sub || ' '}</div>
    </div>
  );
}

export function Chain({ onAdd }: { onAdd(): void }) {
  const blocks = useStore((s) => s.blocks);
  const selectedId = useStore((s) => s.selectedId);
  const status = useStore((s) => s.status);
  const move = useStore((s) => s.moveBlock);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(
      blocks.findIndex((b) => b.id === e.active.id),
      blocks.findIndex((b) => b.id === e.over!.id),
    );
  };
  return (
    <section className="chain" aria-label="시그널 체인">
      <div className="chain-scroll">
        <div className="jack">IN</div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={horizontalListSortingStrategy}>
            {blocks.map((b) => (
              <div className="chain-item" key={b.id}>
                <div className="wire" />
                <Tile block={b} selected={b.id === selectedId} status={status[b.id]} />
              </div>
            ))}
          </SortableContext>
        </DndContext>
        <div className="wire" />
        <button className="tile add-tile" onClick={onAdd} aria-label="이펙트 추가">
          <span className="add-plus">+</span>
          <span>이펙트 추가</span>
        </button>
        <div className="wire" />
        <div className="jack">OUT</div>
      </div>
      <p className="chain-hint">타일을 눌러 편집 · 드래그해서 순서 변경 · LED로 바이패스</p>
    </section>
  );
}
