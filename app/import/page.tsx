import Link from 'next/link'
import CustomerNotificationTool from '../components/CustomerNotificationTool'
import PackingListImport from '../components/PackingListImport'
import BrandLogos from '@/components/BrandLogos'

export default function ImportPage() {
  return (
    <main>
      <div className="card grid" style={{ maxWidth: 1500, margin: '0 auto', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <BrandLogos height={30} />
            <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.01em' }}>Import &amp; Notifications</h1>
          </div>
          <Link href="/"><button type="button" className="btn-secondary">← Back to dashboard</button></Link>
        </div>
        <div className="grid grid-2" style={{ alignItems: 'start', gap: 18 }}>
          <CustomerNotificationTool />
          <PackingListImport />
        </div>
      </div>
    </main>
  )
}
