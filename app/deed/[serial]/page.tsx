import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import DeedClient from './DeedClient'

export const revalidate = 60

interface Props {
  params: { serial: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const serialNum = parseInt(params.serial, 10)
  if (isNaN(serialNum)) return { title: 'Deed | Footprint' }

  const supabase = createServerSupabaseClient()
  const { data: user } = await supabase
    .from('users')
    .select('serial_number, email, created_at')
    .eq('serial_number', serialNum)
    .single()

  if (!user) return { title: `#${serialNum} | Footprint` }

  const { data: fp } = await supabase
    .from('footprints')
    .select('display_name, username, bio')
    .eq('serial_number', serialNum)
    .single()

  const name = fp?.display_name || `#${serialNum}`
  const title = `Deed of Ownership — ${name} · Footprint #${serialNum}`

  return {
    title,
    description: `Permanent proof of ownership for Footprint #${serialNum}. Claimed and held forever.`,
    openGraph: {
      title,
      description: `Permanent proof of ownership for Footprint #${serialNum}.`,
      images: [`https://footprint.onl/api/og?slug=${fp?.username || ''}`],
    },
  }
}

export default async function DeedPage({ params }: Props) {
  const serialNum = parseInt(params.serial, 10)
  if (isNaN(serialNum)) notFound()

  const supabase = createServerSupabaseClient()

  const { data: user } = await supabase
    .from('users')
    .select('serial_number, created_at')
    .eq('serial_number', serialNum)
    .single()

  const { data: fp } = await supabase
    .from('footprints')
    .select('display_name, username, bio, background_url, serial_number')
    .eq('serial_number', serialNum)
    .single()

  const claimed = !!user
  const claimedDate = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  }) : null
  const name = fp?.display_name || null
  const slug = fp?.username || null
  const wallpaper = fp?.background_url || null

  return (
    <DeedClient
      serial={serialNum}
      claimed={claimed}
      claimedDate={claimedDate}
      name={name}
      slug={slug}
      wallpaper={wallpaper}
    />
  )
}
