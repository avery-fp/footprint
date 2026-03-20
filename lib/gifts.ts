/**
 * Gift email sending via Resend
 */

export async function sendGiftEmail(recipientEmail: string, claimToken: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.footprint.onl'
  const claimUrl = `${baseUrl}/gift/claim?token=${claimToken}`

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Gift email for ${recipientEmail}: ${claimUrl}`)
    return true
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Footprint <hello@footprint.onl>',
      to: recipientEmail,
      subject: 'Someone gifted you a footprint',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
          <p style="font-size: 24px; font-weight: 300; margin-bottom: 8px; color: #1a1a1a;">
            You got a footprint
          </p>
          <p style="color: #666; font-size: 15px; line-height: 1.6;">
            Someone thinks your work deserves a home on the internet.
            A footprint is a single page for everything you do — photos, links, music, writing, all in one clean grid.
          </p>
          <p style="color: #666; font-size: 15px; line-height: 1.6;">
            It's yours. Free. Forever.
          </p>
          <a href="${claimUrl}" style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 500; margin: 20px 0;">
            Claim your footprint →
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">
            This link is unique to you. It can only be used once.
          </p>
        </div>
      `,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API error (${res.status}): ${body}`)
  }

  return true
}
