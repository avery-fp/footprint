import { Metadata } from 'next'
import { getTheme } from '@/lib/themes'
import PreviewClient from './PreviewClient'

export const metadata: Metadata = {
  title: 'Your footprint — preview',
  description: 'See what your footprint could look like.',
  robots: { index: false, follow: false },
}

interface Props {
  searchParams: { name?: string; city?: string; category?: string; theme?: string }
}

export default function PreviewPage({ searchParams }: Props) {
  const name = searchParams.name || 'Your Name'
  const city = searchParams.city || ''
  const category = searchParams.category || ''
  const themeId = searchParams.theme || 'midnight'
  const theme = getTheme(themeId)

  return <PreviewClient name={name} city={city} category={category} theme={theme} themeId={themeId} />
}
