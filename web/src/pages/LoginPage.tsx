import { useState } from 'react'
import { dataApi } from '../lib/api'
import { Button, ErrorNote, TextField } from '../components/ui'

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setInfo(null)
    try {
      if (mode === 'signin') {
        const { error } = await dataApi.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await dataApi.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) setInfo('Compte créé. Confirmez votre adresse à partir du courriel reçu, puis connectez-vous.')
      }
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <svg className="absolute inset-x-0 bottom-0 h-1/2 w-full" viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden>
          <path d="M0 300 L120 150 L210 230 L330 90 L450 210 L520 140 L600 200 L600 300 Z" fill="#0F6E6A" fillOpacity="0.55" />
          <path d="M0 300 L90 230 L200 270 L300 190 L420 260 L600 230 L600 300 Z" fill="#E0B000" fillOpacity="0.35" />
        </svg>
        <p className="relative text-sm text-white/60">Société Minière Africaine</p>
        <div className="relative max-w-md">
          <h1 className="text-5xl" style={{ fontStretch: '70%' }}>Le personnel et la paie de la SOMA, au même endroit.</h1>
          <p className="mt-4 text-white/70">
            Fiches du personnel, congés, présences et paie mensuelle conformes aux barèmes IR, TRIMF, IPRES, CSS et IPM.
          </p>
        </div>
        <p className="relative text-xs text-white/40">SOMA-RH</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div>
            <h2 className="text-2xl">{mode === 'signin' ? 'Connexion' : 'Créer un compte'}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {mode === 'signin'
                ? 'Utilisez votre adresse professionnelle.'
                : 'Le premier compte créé pourra se déclarer administrateur dans Paramètres.'}
            </p>
          </div>
          <TextField label="Adresse e-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Mot de passe" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <ErrorNote error={error} />
          {info && <p className="rounded border border-river/30 bg-river-light px-3 py-2 text-sm text-river-dark">{info}</p>}
          <Button type="submit" variant="primary" loading={busy} className="w-full">
            {mode === 'signin' ? 'Se connecter' : 'Créer le compte'}
          </Button>
          <button type="button" className="text-sm text-river hover:underline" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? 'Pas encore de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
