import './globals.css'
import { Toaster } from 'sonner'

// Force dynamic rendering for all routes
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'footprint',
  description: 'a room for your internet. $10.',
  openGraph: {
    title: 'footprint',
    description: 'a room for your internet. $10.',
    url: 'https://footprint.onl',
    siteName: 'footprint',
    images: [{ url: 'https://footprint.onl/api/og', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'footprint',
    description: 'a room for your internet. $10.',
    images: ['https://footprint.onl/api/og'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" style={{ backgroundColor: '#080808' }}>
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
