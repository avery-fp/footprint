#!/usr/bin/env node
/**
 * Read-only audit of the ownership data model PR #261 relies on.
 *   footprints.username = 'ae' → footprints.user_id → users.email
 * Also confirms migration 024 safety.
 *
 * Usage:
 *   node --env-file=/Users/aeonic/footprint/.env.local \
 *     scripts/audit-owner-data-model.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function maskEmail(e) {
  if (!e) return null
  const [local, domain] = e.split('@')
  if (!local || !domain) return '<unparseable>'
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(1, local.length - 1))}@${domain}`
}
const out = (k, v) => console.log(`${k.padEnd(40)} ${v}`)

console.log('\n── footprints row for slug "ae" ──')
const { data: fp, error: fpErr } = await supabase
  .from('footprints')
  .select('username, user_id, edit_token, serial_number, published')
  .eq('username', 'ae')
  .maybeSingle()
if (fpErr || !fp) { console.error(fpErr || 'not found'); process.exit(1) }
out('footprints.username=ae exists',     'YES')
out('footprints.user_id present',        fp.user_id ? 'YES' : 'NO')
out('footprints.edit_token present',     fp.edit_token ? 'YES' : 'NO')
out('footprints.serial_number',          fp.serial_number ?? 'null')

console.log('\n── users row (PR #261 path) ──')
const { data: u, error: uErr } = await supabase
  .from('users')
  .select('id, email, serial_number, created_at')
  .eq('id', fp.user_id)
  .maybeSingle()
if (uErr) { out('users query error', `${uErr.code || ''} ${uErr.message}`) }
else if (!u) { out('users row exists', 'NO  (orphan)') }
else {
  out('users row exists',          'YES')
  out('users.email present',       u.email ? 'YES' : 'NO')
  out('users.email masked',        maskEmail(u.email))
  out('users.email lowercase',     u.email && u.email === u.email.toLowerCase() ? 'YES' : 'NO')
}

console.log('\n── users table column probe ──')
for (const col of ['email', 'stripe_customer_id', 'stripe_email', 'owner_email', 'payment_email', 'serial_number']) {
  const { error } = await supabase.from('users').select(col, { head: true, count: 'exact' }).limit(1)
  out(`users.${col}`, error ? `MISSING (${error.code || ''})` : 'present')
}

console.log('\n── alternative ownership tables ──')
for (const tbl of ['payments', 'claims', 'magic_links', 'recovery_attempts', 'slug_reservations']) {
  const { error } = await supabase.from(tbl).select('*', { head: true, count: 'exact' }).limit(1)
  out(tbl, error ? `MISSING (${error.code || ''})` : 'exists')
}

console.log('\n── migration 024 safety ──')
// HEAD count returns 204 even for non-existent tables in some PostgREST
// configs — false positive on table existence. Use a real GET so the
// schema cache is actually consulted.
const { error: t1 } = await supabase.from('edit_access_codes').select('id').limit(1)
out('edit_access_codes table',
  t1 ? (t1.code === 'PGRST205' || /does not exist|schema cache/i.test(t1.message || '') ? 'NOT EXIST (run migration 024)' : `error: ${t1.code} ${t1.message}`)
     : 'EXISTS (migration uses IF NOT EXISTS, idempotent)')

console.log('\n── done ──')
