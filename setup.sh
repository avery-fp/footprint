#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# FOOTPRINT NANO - SETUP SCRIPT
# ═══════════════════════════════════════════════════════════════════════════════
# 
# This script helps you set up Footprint in 10 minutes.
# Run it, follow the prompts, paste the credentials.
#
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "  FOOTPRINT NANO SETUP"
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

# Check if .env.local exists
if [ -f .env.local ]; then
    echo "⚠️  .env.local already exists. Delete it to start fresh, or edit manually."
    exit 1
fi

echo "Let's get your credentials. Open these in browser tabs:"
echo ""
echo "  1. https://supabase.com/dashboard (create project)"
echo "  2. https://dashboard.stripe.com/test/apikeys"
echo "  3. https://dashboard.stripe.com/test/webhooks"
echo ""
echo "Press ENTER when ready..."
read

# ─────────────────────────────────────────────────────────────────────────────────
# SUPABASE
# ─────────────────────────────────────────────────────────────────────────────────

echo ""
echo "─── SUPABASE ───────────────────────────────────────────────────────────────────"
echo ""
echo "In Supabase Dashboard → Settings → API, copy these values:"
echo ""

read -p "Project URL (https://xxx.supabase.co): " SUPABASE_URL
read -p "anon public key (eyJ...): " SUPABASE_ANON_KEY
read -p "service_role secret key (eyJ...): " SUPABASE_SERVICE_KEY

# ─────────────────────────────────────────────────────────────────────────────────
# STRIPE
# ─────────────────────────────────────────────────────────────────────────────────

echo ""
echo "─── STRIPE ─────────────────────────────────────────────────────────────────────"
echo ""
echo "In Stripe Dashboard → Developers → API Keys:"
echo ""

read -p "Publishable key (pk_test_...): " STRIPE_PK
read -p "Secret key (sk_test_...): " STRIPE_SK

echo ""
echo "For webhook secret, we'll set it up after deploy. Using placeholder for now."
STRIPE_WEBHOOK="whsec_placeholder"

# ─────────────────────────────────────────────────────────────────────────────────
# APP CONFIG
# ─────────────────────────────────────────────────────────────────────────────────

echo ""
echo "─── APP CONFIG ─────────────────────────────────────────────────────────────────"
echo ""

read -p "Your domain (e.g., footprint.link, or leave blank for localhost): " APP_DOMAIN

if [ -z "$APP_DOMAIN" ]; then
    APP_URL="http://localhost:3000"
else
    APP_URL="https://$APP_DOMAIN"
fi

# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 32)

# ─────────────────────────────────────────────────────────────────────────────────
# WRITE .env.local
# ─────────────────────────────────────────────────────────────────────────────────

cat > .env.local << ENVEOF
# Supabase
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_KEY

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$STRIPE_PK
STRIPE_SECRET_KEY=$STRIPE_SK
STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK

# Auth
JWT_SECRET=$JWT_SECRET

# App
NEXT_PUBLIC_APP_URL=$APP_URL
ENVEOF

echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "  ✓ .env.local created!"
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "NEXT STEPS:"
echo ""
echo "  1. Run the database setup:"
echo "     → Go to Supabase → SQL Editor → paste contents of schema.sql → Run"
echo ""
echo "  2. Create storage bucket:"
echo "     → Supabase → Storage → New Bucket → Name: 'avatars' → Public: ON"
echo ""
echo "  3. Test locally:"
echo "     npm install"
echo "     npm run dev"
echo ""
echo "  4. Deploy to Vercel:"
echo "     npx vercel --prod"
echo "     (copy env vars from .env.local to Vercel dashboard)"
echo ""
echo "  5. Set up Stripe webhook:"
echo "     → Stripe → Webhooks → Add endpoint"
echo "     → URL: $APP_URL/api/webhook"
echo "     → Events: checkout.session.completed"
echo "     → Copy signing secret → update STRIPE_WEBHOOK_SECRET"
echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"
