import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from 'sonner'
import PwaLaunchRestore from '@/components/PwaLaunchRestore'

export const metadata: Metadata = {
  title: 'footprint',
  description: 'one page for everything.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Footprint',
    statusBarStyle: 'black-translucent',
  },
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
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Footprint" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180x180.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/apple-touch-icon.png" />
      </head>
      <body className="font-sans" style={{ backgroundColor: '#080808' }}>
        <PwaLaunchRestore />
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
