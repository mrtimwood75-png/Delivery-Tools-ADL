/** @type {import('next').NextConfig} */

// Baseline HTTP security headers applied to every response. Kept deliberately
// conservative so they harden the app (clickjacking, MIME sniffing, referrer
// leakage, plugin/base-tag abuse) without breaking Next.js's inline hydration
// scripts — hence the CSP restricts only frame-ancestors/base-uri/object-src
// rather than script-src. Card entry happens entirely on Stripe's hosted
// checkout, so no third-party payment scripts need allowing here.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" }
]

const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  }
}

module.exports = nextConfig
