import { NextRequest, NextResponse } from 'next/server'
import { getPriceForCountry } from '@/lib/pricing'

export async function GET(request: NextRequest) {
  const country = request.headers.get('cf-ipcountry')
    || request.headers.get('x-vercel-ip-country')
    || 'US'

  const pricing = getPriceForCountry(country)

  return NextResponse.json({
    country,
    price: pricing.display,
    amount: pricing.amount,
    currency: pricing.currency,
  })
}
