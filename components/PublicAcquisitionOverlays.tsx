'use client'

import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'

const ReferralBanner = dynamic(() => import('@/components/ReferralBanner'), { ssr: false })
const ClaimOverlay = dynamic(() => import('@/components/ClaimOverlay'), { ssr: false })

interface PublicAcquisitionOverlaysProps {
  serial: string
  slug: string
}

export default function PublicAcquisitionOverlays({ serial, slug }: PublicAcquisitionOverlaysProps) {
  const params = useSearchParams()
  const showReferral = params.get('ref')?.startsWith('FP-') ?? false
  const showClaim = params.get('claimed') === 'true' && Boolean(params.get('session_id'))

  return (
    <>
      {showReferral && <ReferralBanner serial={serial} />}
      {showClaim && <ClaimOverlay slug={slug} />}
    </>
  )
}
