import React from 'react'

// Shared design foundation for the customer-facing apps (Payments, Messages,
// Order Tools). One source of truth for colour, spacing, radius and the core
// primitives — so the surfaces stop drifting apart in inline styles.

export const tokens = {
  color: {
    ground: '#f4f3f1',
    paper: '#ffffff',
    ink: '#1a1a1a',
    inkSoft: '#6b6b6b',   // labels, intro copy — AA on white
    inkFaint: '#6f6a61',  // helper/hint text — AA on white (~4.7:1)
    line: '#d3ccbe',
    lineSoft: '#e7e3db',
    // Brass — the one brand accent, from the gold Pay-Now button
    brass: '#8a6d3b',
    brassInk: '#5f4e22',
    brassLine: '#cbb98f',
    brassWash: '#f7f1e2',
    // Stone — the calm secondary surface
    stone: '#eceae4',
    stoneDim: '#e2e0da',
    // Semantic, held apart from the accent
    danger: '#b3261e',
    dangerWash: '#fdecea',
    success: '#3f6b46',
    disabled: '#9a9a9a'
  },
  radius: { input: 8, control: 12, card: 14 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  font: { xs: 11.5, sm: 12.5, body: 14, base: 15, lg: 16, h2: 20, h1: 22 }
} as const

const c = tokens.color

// ---- Shared style objects (import instead of redefining per page) ----

export const label: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.04em',
  textTransform: 'uppercase', color: c.inkSoft, marginBottom: 6
}

export const input: React.CSSProperties = {
  width: '100%', padding: '11px 13px', border: `1px solid ${c.line}`,
  borderRadius: tokens.radius.input, fontSize: 15, background: '#fff',
  boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums'
}

export const field: React.CSSProperties = { marginBottom: 18 }

export const cardStyle: React.CSSProperties = {
  background: c.paper, borderRadius: tokens.radius.card, padding: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,.08)'
}

export const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
  color: c.inkFaint, margin: '0 0 14px'
}

export const pageTitle: React.CSSProperties = { fontSize: tokens.font.h1, fontWeight: 600, margin: 0 }
export const pageIntro: React.CSSProperties = { color: c.inkSoft, fontSize: tokens.font.body, marginTop: 8 }

// ---- Card ----

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...cardStyle, ...style }}>{children}</div>
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={sectionTitleStyle}>{children}</div>
}

// ---- Button ----

export type ButtonVariant = 'hero' | 'primary' | 'secondary' | 'brass' | 'brassSolid'

function variantStyle(variant: ButtonVariant, disabled: boolean): React.CSSProperties {
  switch (variant) {
    case 'hero':
      return { padding: '15px 0', fontSize: 16, background: disabled ? c.disabled : c.ink, color: '#fff', boxShadow: disabled ? 'none' : '0 1px 2px rgba(0,0,0,.18)' }
    case 'primary':
      return { padding: '13px 0', fontSize: 15, background: disabled ? c.disabled : c.ink, color: '#fff' }
    case 'secondary':
      return { padding: '13px 0', fontSize: 15, background: disabled ? c.stoneDim : c.stone, color: c.ink }
    case 'brass':
      return { padding: '13px 0', fontSize: 15, border: `1px solid ${c.brassLine}`, background: disabled ? '#f3f0e8' : c.brassWash, color: disabled ? '#a79f8c' : c.brassInk }
    case 'brassSolid':
      return { padding: '12px 0', fontSize: 15, background: c.brass, color: '#fff' }
  }
}

// ---- Icons ----
// Inline SVGs that inherit color (currentColor) and size — crisp, brand-tintable
// replacements for the emoji the apps used to render.

type IconProps = { size?: number; style?: React.CSSProperties }
function Svg({ size = 16, style, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: '0 0 auto', display: 'inline-block', verticalAlign: 'text-bottom', ...style }} aria-hidden="true">
      {children}
    </svg>
  )
}

export const IconFile = (p: IconProps) => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Svg>
export const IconPaperclip = (p: IconProps) => <Svg {...p}><path d="M21 8.5 11.8 17.7a3.5 3.5 0 0 1-5-5l8.5-8.5a2.3 2.3 0 0 1 3.3 3.3l-8.5 8.5a1.15 1.15 0 0 1-1.63-1.63l7.8-7.8" /></Svg>
export const IconMail = (p: IconProps) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Svg>
export const IconReset = (p: IconProps) => <Svg {...p}><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /></Svg>
export const IconCheck = (p: IconProps) => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>
export const IconGrip = ({ size = 16, style }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flex: '0 0 auto', ...style }} aria-hidden="true">
    <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
  </svg>
)
export const IconBell = (p: IconProps) => <Svg {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Svg>
export const IconBellOff = (p: IconProps) => <Svg {...p}><path d="M6 8a6 6 0 0 1 9.3-5" /><path d="M18 8c0 7 3 9 3 9H7" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /><path d="M2 2l20 20" /></Svg>

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }

export function Button({ variant = 'primary', disabled = false, style, children, ...rest }: ButtonProps) {
  const base: React.CSSProperties = {
    width: '100%', borderRadius: tokens.radius.control, border: '1px solid transparent',
    fontWeight: 600, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
    transition: 'background .15s ease, box-shadow .15s ease'
  }
  return (
    <button disabled={disabled} style={{ ...base, ...variantStyle(variant, disabled), ...style }} {...rest}>
      {children}
    </button>
  )
}
