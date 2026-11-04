import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { dataApi, unwrap, type ApiClient } from '../../lib/api'
import { assignmentInfo, fmtDate, fullName, initials, type OrgData, type OrgTeam } from '../../lib/org'
import { PersonSelect } from './PersonSelect'

/** Vue « par équipe » : équipes transverses, projets et comités, avec responsable et quotes-parts. */

const db = dataApi as unknown as ApiClient
const KIND: Record<string, string> = { cross_functional: 'Équipe transverse', project: 'Projet', committee: 'Comité', department: 'Service' }
const today = () => new Date().toISOString().slice(0, 10)

type Dialog = { kind: 'team' } | { kind: 'member'; team: OrgTeam }

export function TeamsView({ data, canEdit, onSelect }: { data: OrgData; canEdit: boolean; onSelect: (id: string) => void }) {
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const byId = new Map(data.noeuds.map((n) => [n.id, n]))
  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm" style={{ color: 'var(--o-muted)' }}>{data.equipes.length} équipe(s) active(s) au {fmtDate(data.date)}. Les équipes ne modifient pas la hiérarchie directe.</p>
        {canEdit && <button type="button" className="org-btn" data-primary="true" onClick={() => setDialog({ kind: 'team' })}><Plus className="h-4 w-4" aria-hidden />Nouvelle équipe</button>}
      </div>
      {data.equipes.length === 0 ? (
        <div className="org-glass rounded-2xl p-8 text-center">
          <Users className="mx-auto mb-2 h-8 w-8" aria-hidden style={{ color: 'var(--o-muted)' }} />
          <p className="font-semibold">Aucune équipe transverse</p>
          <p className="text-sm" style={{ color: 'var(--o-muted)' }}>Créez un projet, un comité ou une équipe transverse pour regrouper des salariés en dehors de la hiérarchie.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.equipes.map((t) => {
            const lead = t.responsable ? byId.get(t.responsable) : undefined
            return (
              <section key={t.id} className="org-glass rounded-2xl p-4" aria-label={t.nom}>
                <div className="flex items-start justify-between gap-2">
                  <div><h3 className="font-semibold">{t.nom}</h3><p className="text-xs" style={{ color: 'var(--o-violet)' }}>{KIND[t.type] ?? t.type} · depuis le {fmtDate(t.debut)}{t.fin ? ` jusqu’au ${fmtDate(t.fin)}` : ''}</p></div>
                  {canEdit && <button type="button" className="org-btn" onClick={() => setDialog({ kind: 'member', team: t })} aria-label={`Ajouter un membre à ${t.nom}`}><UserPlus className="h-4 w-4" aria-hidden /></button>}
                </div>
                {lead && <button type="button" className="org-btn mt-3 w-full justify-start" onClick={() => onSelect(lead.id)}><span className="org-avatar" style={{ width: 28, height: 28, fontSize: 11, background: 'var(--o-accent-2)' }} aria-hidden>{initials(lead)}</span>{fullName(lead)}<span className="ml-auto text-xs font-normal" style={{ color: 'var(--o-muted)' }}>Responsable</span></button>}
                <ul className="mt-2 space-y-1">
                  {t.membres.map((m) => { const p = byId.get(m.employe); return p ? (
                    <li key={m.employe}><button type="button" className="org-btn w-full justify-start" onClick={() => onSelect(p.id)}>{fullName(p)}<span className="ml-auto text-xs font-normal" style={{ color: 'var(--o-muted)' }}>{m.role}{m.quote_part ? ` · ${m.quote_part} %` : ''}</span></button></li>
                  ) : null })}
                  {t.membres.length === 0 && <li className="text-sm" style={{ color: 'var(--o-muted)' }}>Aucun membre.</li>}
                </ul>
              </section>
            )
          })}
        </div>
      )}
      {dialog && <TeamDialog dialog={dialog} data={data} onClose={() => setDialog(null)} />}
    </div>
  )
}

function TeamDialog({ dialog, data, onClose }: { dialog: Dialog; data: OrgData; onClose: () => void }) {
  const people = data.noeuds
  const info = assignmentInfo(data)
  const qc = useQueryClient()
  const [f, setF] = useState({ name: '', kind: 'project', lead: '', employee: '', role: 'membre', pct: '', start: today(), reason: '' })
  const save = useMutation({
    mutationFn: async () => dialog.kind === 'team'
      ? unwrap(await db.rpc('org_save_team', { p_id: null, p_name: f.name, p_kind: f.kind, p_lead: f.lead || null, p_start: f.start, p_end: null, p_reason: f.reason.trim() || null }))
      : unwrap(await db.rpc('org_set_team_member', { p_team: dialog.team.id, p_employee: f.employee, p_role: f.role, p_pct: f.pct === '' ? 0 : Number(f.pct), p_start: f.start, p_end: null, p_reason: f.reason.trim() || null })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org_chart'] }); onClose() },
  })
  const invalid = dialog.kind === 'team' ? !f.name.trim() : !f.employee
  const L = ({ t, children }: { t: string; children: React.ReactNode }) => <label className="block text-xs font-semibold" style={{ color: 'var(--o-muted)' }}>{t}<div className="mt-1 font-normal [&>*]:w-full">{children}</div></label>
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'rgba(3, 7, 18, .6)' }} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="org-glass w-full max-w-md rounded-2xl p-5" role="dialog" aria-modal="true" aria-label={dialog.kind === 'team' ? 'Nouvelle équipe' : 'Ajouter un membre'} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2 className="mb-3 text-base font-semibold">{dialog.kind === 'team' ? 'Nouvelle équipe' : `Ajouter un membre — ${dialog.team.nom}`}</h2>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          {dialog.kind === 'team' ? (
            <>
              <L t="Nom"><input className="org-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus required /></L>
              <L t="Type"><select className="org-input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{['project', 'committee', 'cross_functional'].map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select></L>
              <L t="Responsable"><select className="org-input" value={f.lead} onChange={(e) => setF({ ...f, lead: e.target.value })}><option value="">— aucun —</option>{people.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</select></L>
            </>
          ) : (
            <>
              <L t="Salarié"><PersonSelect people={people} value={f.employee} onChange={(employee) => setF({ ...f, employee })} autoFocus
                hint={(p) => { const a = info.get(p.id); return a && (a.teams.length || a.manager) ? [a.manager ? `sous ${a.manager}` : '', a.teams.length ? `équipe : ${a.teams.join(', ')}` : ''].filter(Boolean).join(' · ') : null }} /></L>
              <div className="grid grid-cols-2 gap-3">
                <L t="Rôle"><input className="org-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></L>
                <L t="Quote-part (%)"><input className="org-input" type="number" min={0} max={100} value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></L>
              </div>
            </>
          )}
          <L t="Début"><input className="org-input" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} required /></L>
          <L t="Information complémentaire (facultative)"><input className="org-input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Vous pouvez laisser ce champ vide" /></L>
          {save.error && <p role="alert" className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--o-amber)', color: 'var(--o-amber)' }}>{(save.error as Error).message}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="org-btn" onClick={onClose}>Annuler</button><button type="submit" className="org-btn" data-primary="true" disabled={invalid || save.isPending}>Enregistrer</button></div>
        </form>
      </div>
    </div>
  )
}
