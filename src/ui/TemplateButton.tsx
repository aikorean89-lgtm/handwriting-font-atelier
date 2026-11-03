import { useState } from 'react'
import { SaveDeclined, saveTemplatePdf } from '../platform'

export function TemplateButton({ label, className = 'btn', file, name }: { label: string; className?: string; file?: string; name?: string }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <button className={className} disabled={busy} onClick={async () => {
        setErr(null); setBusy(true)
        try { await saveTemplatePdf(file, name) } catch (e) { if (!(e instanceof SaveDeclined)) setErr((e as Error).message) } finally { setBusy(false) }
      }}>{label}</button>
      {err && <span className="note" role="alert" style={{ flexBasis: '100%' }}>{err}</span>}
    </>
  )
}
