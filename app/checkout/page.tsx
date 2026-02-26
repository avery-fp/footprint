'use client'

import { useEffect } from 'react'

export default function CheckoutPage() {
  useEffect(() => {
    const paymentLink = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK
    if (paymentLink) {
      window.location.href = paymentLink
    }
  }, [])

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      <div className="fixed inset-0 bg-[#0a0a0a]" />
      <p className="relative z-10 text-white/30 text-[15px]">
        Redirecting to payment...
      </p>
    </div>
  )
}
