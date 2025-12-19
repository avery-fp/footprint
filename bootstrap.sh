#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# FOOTPRINT ONE-LINE DEPLOY
# 
# Run this:
#   curl -fsSL https://raw.githubusercontent.com/YOU/footprint/main/bootstrap.sh | bash
#
# Or if you have the files locally:
#   ./bootstrap.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  FOOTPRINT BOOTSTRAP"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check dependencies
command -v node >/dev/null 2>&1 || { echo "Node.js required. Install: https://nodejs.org"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "Git required."; exit 1; }

# Get credentials
echo "Open these tabs and grab your keys:"
echo "  → https://supabase.com/dashboard (Settings > API)"
echo "  → https://dashboard.stripe.com/test/apikeys"
echo ""

read -p "Supabase URL (https://xxx.supabase.co): " SB_URL
read -p "Supabase anon key: " SB_ANON
read -p "Supabase service_role key: " SB_SERVICE
read -p "Stripe publishable key (pk_test_): " STRIPE_PK
read -p "Stripe secret key (sk_test_): " STRIPE_SK

# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 32)

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  SETTING UP..."
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Create .env.local
cat > .env.local << ENVEOF
NEXT_PUBLIC_SUPABASE_URL=$SB_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SB_ANON
SUPABASE_SERVICE_ROLE_KEY=$SB_SERVICE
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$STRIPE_PK
STRIPE_SECRET_KEY=$STRIPE_SK
STRIPE_WEBHOOK_SECRET=whsec_placeholder
JWT_SECRET=$JWT_SECRET
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENVEOF

echo "✓ .env.local created"

# Create Stripe product
echo "Creating Stripe product..."
PRODUCT_RESPONSE=$(curl -s -X POST https://api.stripe.com/v1/products \
  -u "$STRIPE_SK:" \
  -d "name=Footprint" \
  -d "description=\$10. Yours forever.")

PRODUCT_ID=$(echo $PRODUCT_RESPONSE | grep -o '"id": *"[^"]*"' | head -1 | cut -d'"' -f4)

if [ ! -z "$PRODUCT_ID" ]; then
  echo "✓ Product created: $PRODUCT_ID"
  
  # Create price
  PRICE_RESPONSE=$(curl -s -X POST https://api.stripe.com/v1/prices \
    -u "$STRIPE_SK:" \
    -d "product=$PRODUCT_ID" \
    -d "unit_amount=1000" \
    -d "currency=usd")
  
  echo "✓ Price created: \$10"
else
  echo "! Stripe product may already exist (that's fine)"
fi

# Create storage bucket
echo "Creating storage bucket..."
BUCKET_RESPONSE=$(curl -s -X POST "$SB_URL/storage/v1/bucket" \
  -H "apikey: $SB_SERVICE" \
  -H "Authorization: Bearer $SB_SERVICE" \
  -H "Content-Type: application/json" \
  -d '{"id":"avatars","name":"avatars","public":true}')

echo "✓ Storage bucket ready"

# Install dependencies
echo "Installing dependencies..."
npm install --silent

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DATABASE SETUP"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Paste the contents of schema.sql into Supabase SQL Editor and Run."
echo "→ https://supabase.com/dashboard/project/$(echo $SB_URL | cut -d'/' -f3 | cut -d'.' -f1)/sql"
echo ""
read -p "Press Enter when done..."

# Deploy to Vercel
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DEPLOYING TO VERCEL"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if Vercel CLI exists
if ! command -v vercel &> /dev/null; then
  echo "Installing Vercel CLI..."
  npm install -g vercel
fi

echo "Follow the prompts to deploy:"
echo ""

vercel --prod \
  -e NEXT_PUBLIC_SUPABASE_URL="$SB_URL" \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY="$SB_ANON" \
  -e SUPABASE_SERVICE_ROLE_KEY="$SB_SERVICE" \
  -e NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="$STRIPE_PK" \
  -e STRIPE_SECRET_KEY="$STRIPE_SK" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e STRIPE_WEBHOOK_SECRET="whsec_placeholder"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✓ DEPLOYED"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Last step - set up Stripe webhook:"
echo ""
echo "1. Go to: https://dashboard.stripe.com/test/webhooks"
echo "2. Add endpoint: YOUR_VERCEL_URL/api/webhook"
echo "3. Select event: checkout.session.completed"
echo "4. Copy signing secret, add to Vercel as STRIPE_WEBHOOK_SECRET"
echo "5. Redeploy"
echo ""
echo "Then test with card: 4242 4242 4242 4242"
echo ""
echo "You're live."
