import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from 'sonner'

// Force dynamic rendering for all routes
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'footprint',
  description: 'one page for everything.',
  openGraph: {
    title: 'footprint',
    description: 'one page for everything.',
    url: 'https://footprint.onl',
    siteName: 'footprint',
    images: [{ url: 'https://footprint.onl/api/og', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'footprint',
    description: 'one page for everything.',
    images: ['https://footprint.onl/api/og'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" style={{ backgroundColor: '#080808' }}>
      <head>
        <link rel="apple-touch-icon" href="/icon-transparent.png" />
      </head>
      <body className="font-sans" style={{ backgroundColor: '#080808' }}>
        {children}
        <Toaster 
          position="bottom-center"
          toastOptions={{
            style: {
              background: '#F5F5F5',
              color: '#07080A',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '13px',
            },
          }}
        />
      </body>
    </html>
  )
}
