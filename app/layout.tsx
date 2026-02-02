import './globals.css'
import { Toaster } from 'sonner'

// Force dynamic rendering for all routes
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Footprint',
  description: '$10. One page. Paste anything. Yours forever.',
  openGraph: {
    title: 'Footprint',
    description: '$10. One page. Paste anything. Yours forever.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Footprint',
    description: '$10. One page. Paste anything. Yours forever.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans">
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
