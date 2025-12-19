# Footprint

**$10. One page. Paste anything. Yours forever.**

## Deploy in 5 Minutes

```bash
# 1. Clone and enter directory
git clone https://github.com/YOUR_USERNAME/footprint.git
cd footprint

# 2. Run the automated setup
node deploy.mjs

# 3. That's it
```

The script will create your database tables, storage bucket, Stripe product, and deploy to Vercel. You just paste your API keys when prompted.

## Get Your Keys

Before running, grab these from:

| Service | Where to Get Keys |
|---------|-------------------|
| Supabase | [Dashboard](https://supabase.com/dashboard) → Your Project → Settings → API |
| Stripe | [Dashboard](https://dashboard.stripe.com/test/apikeys) → Developers → API Keys |

## What Gets Created

The script automatically:
- Creates `users`, `footprints`, `content`, `payments` tables
- Creates `avatars` storage bucket
- Creates Stripe product + $10 price
- Generates secure JWT secret
- Deploys to Vercel with all env vars

## After Deploy

One manual step: Set up Stripe webhook

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Add endpoint: `https://YOUR-VERCEL-URL/api/webhook`
3. Select event: `checkout.session.completed`
4. Copy signing secret → Add to Vercel as `STRIPE_WEBHOOK_SECRET`
5. Redeploy

## Test It

1. Go to your URL
2. Click Get Started
3. Use test card: `4242 4242 4242 4242`
4. Check Supabase → users table

## Go Live

When ready for real money:
1. Toggle Stripe to Live mode
2. Get live API keys
3. Update Vercel env vars
4. Create new live webhook
5. Redeploy

---

*No refunds. Figure it out.*
