import { useEffect, useRef } from 'react';
import { EFFECTS } from '../audio/effects';
import { CATEGORY_LABEL, type Category } from '../audio/types';
import { useStore } from '../state/store';

const ORDER: Category[] = ['capture', 'cab', 'drive', 'dynamics', 'eq', 'mod', 'delay', 'reverb'];

export function AddMenu({ onClose }: { onClose(): void }) {
  const add = useStore((s) => s.addBlock);
  const blocks = useStore((s) => s.blocks);
  const selectedId = useStore((s) => s.selectedId);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  // New effects land right after the selected block, or at the end of the chain.
  const selectedIndex = blocks.findIndex((b) => b.id === selectedId);
  const at = selectedIndex >= 0 ? selectedIndex + 1 : blocks.length;
  return (
    <dialog
      ref={ref}
      className="add-menu"
      aria-label="이펙트 추가"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <header>
        <h2>이펙트 추가</h2>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </header>
      <div className="add-groups">
        {ORDER.map((cat) => (
          <section key={cat}>
            <h3 data-cat={cat}>{CATEGORY_LABEL[cat]}</h3>
            {EFFECTS.filter((e) => e.category === cat).map((e) => (
              <button
                key={e.type}
                className="add-item"
                data-cat={cat}
                onClick={() => {
                  add(e.type, at);
                  onClose();
                }}
              >
                <strong>{e.name}</strong>
                <span>{e.description}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </dialog>
  );
}
