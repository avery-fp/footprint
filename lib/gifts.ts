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
      subject: 'someone thought of you',
      html: `
        <div style="background-color: #0c0c10; width: 100%; min-height: 100%; margin: 0; padding: 0;">
          <div style="max-width: 600px; margin: 0 auto; padding: 72px 32px 60px 32px; text-align: center;">
            <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 13px; line-height: 1.6; font-weight: 300; color: #555560; letter-spacing: 0.04em; text-transform: lowercase;">
              someone thought of you
            </p>
            <p style="margin: 40px 0 0 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 21px; line-height: 1.55; font-weight: 300; color: #d4c5a9; letter-spacing: 0.01em;">
              you got a footprint.
            </p>
            <p style="margin: 20px 16px 0 16px; font-family: 'DM Mono', 'Courier New', monospace; font-size: 13px; line-height: 1.8; font-weight: 300; color: #777780; letter-spacing: 0.02em;">
              a single page for everything you are.<br>
              your links. your work. your world.<br>
              it's yours now.
            </p>
            <div style="margin: 48px 0 0 0;">
              <a href="${claimUrl}" style="display: inline-block; padding: 14px 36px; background-color: #d4c5a9; color: #0c0c10; font-family: 'DM Mono', 'Courier New', monospace; font-size: 14px; font-weight: 500; text-decoration: none; letter-spacing: 0.04em; border-radius: 3px;">
                claim yours
              </a>
            </div>
            <div style="margin: 80px 0 0 0; border-top: 1px solid #1e1e24; padding-top: 24px;">
              <a href="https://footprint.onl" style="font-family: 'DM Mono', 'Courier New', monospace; font-size: 12px; color: #555560; text-decoration: none; letter-spacing: 0.06em;">footprint.onl</a>
            </div>
          </div>
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
