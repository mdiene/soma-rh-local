import { useEffect, useRef } from 'react'

/** Menu contextuel du bouton « + » d'une carte : clavier (flèches, Échap), fermeture au clic extérieur. */
export type MenuItem = { label: string; onClick: () => void; danger?: boolean; separator?: boolean }

export function OrgMenu({ items, anchor, onClose, title }: { items: MenuItem[]; anchor: DOMRect; onClose: () => void; title: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [onClose])

  const width = 300
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))
  const top = Math.min(anchor.bottom + 6, window.innerHeight - Math.min(items.length * 40 + 24, 440) - 8)
  const move = (dir: 1 | -1) => {
    const b = [...(ref.current?.querySelectorAll('button') ?? [])] as HTMLButtonElement[]
    const i = b.indexOf(document.activeElement as HTMLButtonElement)
    b[(i + dir + b.length) % b.length]?.focus()
  }
  return (
    <div ref={ref} className="org-menu org-glass" style={{ left, top, width }} role="menu" aria-label={title}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowDown') { e.preventDefault(); move(1) } if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) } }}>
      {items.map((it, i) => it.separator
        ? <hr key={i} />
        : <button key={i} type="button" role="menuitem" data-danger={it.danger ? 'true' : 'false'} onClick={() => { onClose(); it.onClick() }}>{it.label}</button>)}
    </div>
  )
}
