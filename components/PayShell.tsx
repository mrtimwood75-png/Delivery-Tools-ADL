// Standalone terminal-state page for the public /pay links (not found, already
// paid, expired). Deliberately minimal — no app navigation and no data beyond
// the single order — so a public link can never reach the tools.
export default function PayShell({ heading, body, tone = 'neutral' }: {
  heading: string; body: string; tone?: 'neutral' | 'good'
}) {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f3f1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#1a1a1a' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '40px 34px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
        <div style={{ fontWeight: 700, letterSpacing: '.14em', fontSize: 15, color: '#1a1a1a', marginBottom: 24 }}>BoConcept</div>
        <div style={{ width: 46, height: 46, borderRadius: '50%', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: tone === 'good' ? '#e7efe6' : '#f1efe9', color: tone === 'good' ? '#3f6b46' : '#8a6d3b' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {tone === 'good' ? <path d="M20 6 9 17l-5-5" /> : <><circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" /></>}
          </svg>
        </div>
        <h1 style={{ fontSize: 21, fontWeight: 650, margin: '0 0 10px' }}>{heading}</h1>
        <p style={{ fontSize: 15, color: '#55514a', lineHeight: 1.55, margin: 0 }}>{body}</p>
      </div>
    </div>
  )
}
