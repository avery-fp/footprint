/**
 * Thin email + welcome-email module.
 *
 * Previously this file held JWT session creation, Supabase-auth session
 * lookup, password hashing, and a dual-cookie verification path. All of that
 * is dead. Stripe is identity now. See lib/edit-auth.ts for the only
 * authorization primitive this app exposes.
 */

/** Normalize email at system boundaries — single source of truth. */
export function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim()
}

/**
 * Send an email via Resend's REST API (no SDK needed)
 */
async function sendEmail(params: { from: string; to: string; subject: string; html: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API error (${res.status}): ${body}`)
  }

  return res.json()
}

/**
 * Welcome email: serial number + the permanent edit link.
 * That edit URL IS the credential. Bookmark it, lose it, recover via /api/recover.
 */
export async function sendWelcomeEmail(
  email: string,
  params: { slug: string; editToken: string; serialNumber: number }
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.footprint.onl'
  const editUrl = `${baseUrl}/${params.slug}/home?token=${params.editToken}`
  const pageUrl = `${baseUrl}/${params.slug}`

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Welcome email for ${email} (FP #${params.serialNumber}): ${editUrl}`)
    return true
  }

  try {
    await sendEmail({
      from: 'Footprint <hello@footprint.onl>',
      to: email,
      subject: `you're FP #${params.serialNumber}`,
      html: `
        <div style="background-color: #0c0c10; width: 100%; min-height: 100%; margin: 0; padding: 0;">
          <div style="max-width: 600px; margin: 0 auto; padding: 72px 32px 60px 32px; text-align: center;">
            <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 13px; line-height: 1.6; font-weight: 300; color: #555560; letter-spacing: 0.04em; text-transform: lowercase;">
              welcome
            </p>
            <p style="margin: 40px 0 0 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 21px; line-height: 1.55; font-weight: 300; color: #d4c5a9; letter-spacing: 0.01em;">
              you're FP #${params.serialNumber.toLocaleString()}
            </p>
            <p style="margin: 20px 16px 0 16px; font-family: 'DM Mono', 'Courier New', monospace; font-size: 13px; line-height: 1.8; font-weight: 300; color: #777780; letter-spacing: 0.02em;">
              your footprint is live at<br>
              <a href="${pageUrl}" style="color: #d4c5a9; text-decoration: none;">footprint.onl/${params.slug}</a>
            </p>
            <div style="margin: 48px 0 0 0;">
              <a href="${editUrl}" style="display: inline-block; padding: 14px 36px; background-color: #d4c5a9; color: #0c0c10; font-family: 'DM Mono', 'Courier New', monospace; font-size: 14px; font-weight: 500; text-decoration: none; letter-spacing: 0.04em; border-radius: 3px;">
                edit your page
              </a>
            </div>
            <p style="margin: 28px 16px 0 16px; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; line-height: 1.7; font-weight: 300; color: #555560; letter-spacing: 0.02em;">
              bookmark this email. the link above is your permanent edit credential.<br>
              lost it? visit footprint.onl/recover.
            </p>
            <div style="margin: 80px 0 0 0; border-top: 1px solid #1e1e24; padding-top: 24px;">
              <a href="https://footprint.onl" style="font-family: 'DM Mono', 'Courier New', monospace; font-size: 12px; color: #555560; text-decoration: none; letter-spacing: 0.06em;">footprint.onl</a>
            </div>
          </div>
        </div>
      `,
    })
  } catch (err) {
    console.error('Welcome email failed:', err)
  }

  return true
}

/**
 * Recovery email: sends new edit URLs for every footprint owned by this email.
 * Called by POST /api/recover. Old edit_tokens have already been rotated.
 */
export async function sendRecoveryEmail(
  email: string,
  footprints: Array<{ slug: string; editToken: string }>
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.footprint.onl'

  // No footprints → still send a short "no account found" to avoid enumeration
  if (footprints.length === 0) {
    if (!process.env.RESEND_API_KEY) {
      console.log(`[DEV] Recovery email for ${email}: no footprints`)
      return true
    }
    try {
      await sendEmail({
        from: 'Footprint <hello@footprint.onl>',
        to: email,
        subject: 'footprint recovery',
        html: `
          <div style="background-color: #0c0c10; padding: 72px 32px; font-family: 'DM Mono', 'Courier New', monospace; color: #777780; text-align: center; font-size: 13px; line-height: 1.8;">
            <p>we couldn't find a footprint for this email.</p>
            <p style="margin-top: 24px;">start yours at <a href="${baseUrl}" style="color: #d4c5a9;">footprint.onl</a></p>
          </div>
        `,
      })
    } catch (err) {
      console.error('Recovery email failed:', err)
    }
    return true
  }

  const links = footprints.map((fp) => {
    const editUrl = `${baseUrl}/${fp.slug}/home?token=${fp.editToken}`
    return `
      <div style="margin: 16px 0; padding: 16px; border: 1px solid #1e1e24; border-radius: 4px;">
        <p style="margin: 0; color: #d4c5a9; font-size: 13px;">footprint.onl/${fp.slug}</p>
        <a href="${editUrl}" style="display: inline-block; margin-top: 8px; color: #777780; font-size: 12px; word-break: break-all;">${editUrl}</a>
      </div>
    `
  }).join('')

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Recovery email for ${email}: ${footprints.length} footprints`)
    return true
  }

  try {
    await sendEmail({
      from: 'Footprint <hello@footprint.onl>',
      to: email,
      subject: 'your footprint edit links',
      html: `
        <div style="background-color: #0c0c10; padding: 72px 32px; font-family: 'DM Mono', 'Courier New', monospace; color: #777780; font-size: 13px; line-height: 1.7; max-width: 600px; margin: 0 auto;">
          <p style="color: #d4c5a9; font-size: 15px;">your edit links</p>
          <p style="margin-top: 24px;">any previous edit link has been invalidated. use the one(s) below:</p>
          ${links}
          <p style="margin-top: 40px; font-size: 11px;">bookmark these. they are your only way back in.</p>
        </div>
      `,
    })
  } catch (err) {
    console.error('Recovery email failed:', err)
  }

  return true
}
