import { createServerSupabaseClient } from '@/lib/supabase'

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { e?: string }
}) {
  const email = searchParams.e ? decodeURIComponent(searchParams.e) : null

  if (email) {
    const supabase = createServerSupabaseClient()
    await supabase
      .from('email_unsubscribes')
      .upsert({ email }, { onConflict: 'email' })
  }

  return (
    <html>
      <body style={{
        margin: 0,
        padding: 0,
        background: '#050505',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <p style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: '15px',
          color: 'rgba(255,255,255,0.35)',
          letterSpacing: '0.01em',
        }}>
          unsubscribed.
        </p>
      </body>
    </html>
  )
}
