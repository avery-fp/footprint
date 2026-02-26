import './globals.css'
import { Toaster } from 'sonner'
import AddToHomeScreen from '@/components/AddToHomeScreen'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.onl'

export const metadata = {
  title: 'footprint',
  description: 'one page for everything.',
  metadataBase: new URL(baseUrl),
  openGraph: {
    title: 'footprint',
    description: 'one page for everything.',
    url: baseUrl,
    siteName: 'footprint',
    images: [{ url: `${baseUrl}/api/og`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'footprint',
    description: 'one page for everything.',
    images: [`${baseUrl}/api/og`],
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" style={{ backgroundColor: '#050505' }}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#050505" />
      </head>
      <body className="font-sans" style={{ backgroundColor: '#050505' }}>
        {children}
        <AddToHomeScreen />
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
