import pricingConfig from '@/config/pricing.json'

interface PriceInfo {
  amount: number
  currency: string
  display: string
}

export function getPriceForCountry(countryCode: string): PriceInfo {
  const code = countryCode.toUpperCase()

  // Check direct match
  if (pricingConfig.regions[code as keyof typeof pricingConfig.regions]) {
    return pricingConfig.regions[code as keyof typeof pricingConfig.regions]
  }

  // Check EU countries
  if (pricingConfig.eu_countries.includes(code)) {
    return pricingConfig.regions.EU
  }

  return pricingConfig.default
}
