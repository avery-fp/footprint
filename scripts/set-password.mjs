#!/usr/bin/env node
/**
 * One-time script: set a password for a user by email.
 *
 * Usage: node scripts/set-password.mjs <email> <password>
 */
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const email = process.argv[2]
const password = process.argv[3]

if (!email || !password) {
  console.error('Usage: node scripts/set-password.mjs <email> <password>')
  process.exit(1)
}

if (password.length < 6) {
  console.error('Password must be at least 6 characters')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const hash = await bcrypt.hash(password, 10)

const { data: user, error: findError } = await supabase
  .from('users')
  .select('id, email, serial_number')
  .eq('email', email.toLowerCase().trim())
  .single()

if (findError || !user) {
  console.error(`No user found with email: ${email}`)
  process.exit(1)
}

const { error: updateError } = await supabase
  .from('users')
  .update({ password_hash: hash })
  .eq('id', user.id)

if (updateError) {
  console.error('Failed to update password:', updateError.message)
  process.exit(1)
}

console.log(`Password set for ${user.email} (FP #${user.serial_number})`)
console.log(`Sign in at: /ae?claim=1`)
