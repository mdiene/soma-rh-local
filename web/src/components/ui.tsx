import clsx from 'clsx'
import { Loader2, X } from 'lucide-react'
import { useEffect, type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'

/* ----------------------------------------------------------------- Bouton */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: ReactNode
}
export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        variant === 'primary' && 'bg-river text-white hover:bg-river-dark',
        variant === 'secondary' && 'border border-line bg-white text-ink hover:border-ink-muted',
        variant === 'ghost' && 'text-ink-soft hover:bg-paper hover:text-ink',
        variant === 'danger' && 'bg-signal text-white hover:bg-signal/90',
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

/* ---------------------------------------------------------- Champs de saisie */
type FieldProps = { label: string; hint?: string; className?: string }
export function TextField({ label, hint, className, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}</span>
      <input className="field" {...rest} />
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  )
}

export function SelectField({ label, hint, className, children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}</span>
      <select className="field" {...rest}>{children}</select>
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  )
}

/* -------------------------------------------------------------- Pastilles */
const BADGE: Record<string, string> = {
  Brouillon: 'bg-paper text-ink-soft border-line',
  Calculée: 'bg-phosphate-light text-ink border-phosphate/40',
  Validée: 'bg-river-light text-river-dark border-river/30',
  Validé: 'bg-river-light text-river-dark border-river/30',
  Annulée: 'bg-signal-light text-signal border-signal/30',
  Annulé: 'bg-signal-light text-signal border-signal/30',
  Ouverte: 'bg-phosphate-light text-ink border-phosphate/40',
  Approuvée: 'bg-river-light text-river-dark border-river/30',
  Rejetée: 'bg-signal-light text-signal border-signal/30',
  Clôturée: 'bg-ink text-white border-ink',
  Active: 'bg-river-light text-river-dark border-river/30',
  Left: 'bg-paper text-ink-muted border-line',
  'En attente': 'bg-orange-100 text-orange-800 border-orange-300',
  'En attente de validation': 'bg-orange-100 text-orange-800 border-orange-300',
  Refusé: 'bg-signal-light text-signal border-signal/30',
}
const STATUS_LABEL: Record<string, string> = { Active: 'Actif', Left: 'Sorti', Inactive: 'Inactif', Suspended: 'Suspendu' }
export function Badge({ value }: { value: string }) {
  return (
    <span className={clsx('inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium', BADGE[value] ?? 'bg-paper text-ink-soft border-line')}>
      {STATUS_LABEL[value] ?? value}
    </span>
  )
}

/* -------------------------------------------------------------- En-tête */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="no-print mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-[1.75rem] text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Section({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('panel', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title && <h2 className="text-base text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

/* ---------------------------------------------------- États vides / erreurs */
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded border border-dashed border-line bg-white px-5 py-8">
      <p className="font-semibold text-ink">{title}</p>
      {children && <p className="max-w-prose text-sm text-ink-soft">{children}</p>}
      {action}
    </div>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : String(error)
  return <p role="alert" className="rounded border border-signal/30 bg-signal-light px-3 py-2 text-sm text-signal">{msg}</p>
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 py-6 text-sm text-ink-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </p>
  )
}

/* ------------------------------------------------------------------ Modale */
export function Modal({ open, title, onClose, children, footer, wide }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx('w-full rounded border border-line bg-white shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-lg">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-paper hover:text-ink" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------- Valeur clé-montant */
export function Figure({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="num mt-0.5 text-xl font-semibold text-ink" style={{ fontStretch: '85%' }}>{value}</p>
      {sub && <p className="text-xs text-ink-soft">{sub}</p>}
    </div>
  )
}
