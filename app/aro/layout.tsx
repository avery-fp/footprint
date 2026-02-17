import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ARO — Deployment Dashboard',
  robots: 'noindex, nofollow',
}

export default function AroLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          background: '#07080A',
          color: '#F5F5F5',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  )
}
