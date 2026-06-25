import './globals.css'
import type { Metadata } from 'next'
import Script from 'next/script'
import AuthGate from '@/components/AuthGate'

export const metadata: Metadata = {
  title: 'Delivery Tools BCB',
  description: 'Delivery management tools for BoConcept'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Script id="delivery-tools-density" strategy="beforeInteractive">
          {`(function(){try{var key='delivery_density';var saved=window.localStorage.getItem(key);if(saved){document.documentElement.setAttribute('data-density',saved)}fetch('/api/settings').then(function(r){return r.json()}).then(function(j){if(j&&j.settings&&j.settings.density){document.documentElement.setAttribute('data-density',j.settings.density);window.localStorage.setItem(key,j.settings.density)}}).catch(function(){})}catch(e){}})()`}
        </Script>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  )
}
