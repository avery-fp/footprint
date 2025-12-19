# DEPLOY FOOTPRINT IN 15 MINUTES

No bullshit. Just do these steps in order.

---

## STEP 1: SUPABASE (5 min)

### Create Project

1. Go to **https://supabase.com/dashboard**
2. Sign in (or create account)
3. Click **New Project**
4. Name it `footprint`
5. Generate a strong password (save it somewhere)
6. Select region closest to you
7. Click **Create new project**
8. Wait 2 minutes for it to provision

### Run Database Schema

1. In your Supabase project, click **SQL Editor** (left sidebar)
2. Click **New query**
3. Copy EVERYTHING from `schema.sql` in this folder
4. Paste it into the SQL editor
5. Click **Run** (or Cmd+Enter)
6. You should see "Success. No rows returned"

### Create Storage Bucket

1. Click **Storage** (left sidebar)
2. Click **New bucket**
3. Name: `avatars`
4. Toggle **Public bucket** ON
5. Click **Create bucket**

### Get Your Keys

1. Click **Settings** (gear icon, left sidebar)
2. Click **API** 
3. Copy these values somewhere:

```
Project URL:        https://xxxxxx.supabase.co
anon public:        eyJhbGc... (long string)
service_role:       eyJhbGc... (different long string - keep secret!)
```

---

## STEP 2: STRIPE (3 min)

### Get API Keys

1. Go to **https://dashboard.stripe.com**
2. Sign in (or create account)
3. Make sure you're in **Test mode** (toggle in sidebar)
4. Go to **Developers → API keys**
5. Copy these values:

```
Publishable key:    pk_test_...
Secret key:         sk_test_... (click to reveal)
```

### Webhook (do after deploy)

We'll come back to this after deploying.

---

## STEP 3: DEPLOY TO VERCEL (5 min)

### Option A: Deploy with Git (Recommended)

1. Push this folder to GitHub:
```bash
cd footprint-1.4
git init
git add .
git commit -m "Initial commit"
gh repo create footprint --public --source=. --push
```

2. Go to **https://vercel.com/new**
3. Import your `footprint` repo
4. Before deploying, add Environment Variables:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service_role key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | pk_test_... |
| `STRIPE_SECRET_KEY` | sk_test_... |
| `STRIPE_WEBHOOK_SECRET` | whsec_placeholder (update later) |
| `JWT_SECRET` | (generate: `openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | https://your-vercel-url.vercel.app |

5. Click **Deploy**
6. Wait ~2 minutes

### Option B: Deploy with CLI

```bash
npm i -g vercel
cd footprint-1.4
vercel --prod
# Follow prompts, paste env vars when asked
```

---

## STEP 4: STRIPE WEBHOOK (2 min)

Now that you have your Vercel URL:

1. Go to **https://dashboard.stripe.com/test/webhooks**
2. Click **Add endpoint**
3. Endpoint URL: `https://YOUR-VERCEL-URL.vercel.app/api/webhook`
4. Click **Select events**
5. Search for `checkout.session.completed`
6. Check the box, click **Add events**
7. Click **Add endpoint**
8. Click **Reveal** under Signing secret
9. Copy the `whsec_...` value
10. Go to Vercel → Your Project → Settings → Environment Variables
11. Update `STRIPE_WEBHOOK_SECRET` with the real value
12. Redeploy: Vercel → Deployments → ... → Redeploy

---

## STEP 5: TEST IT

1. Go to your Vercel URL
2. Click through to checkout
3. Use test card: `4242 4242 4242 4242` (any future date, any CVC)
4. Complete purchase
5. Check Supabase → Table Editor → users (should see new row)
6. Check your email for magic link (or check console logs in Vercel)
7. Click magic link
8. You're in the editor

---

## STEP 6: GO LIVE

When ready for real money:

1. Stripe Dashboard → Toggle OFF "Test mode"
2. Get live API keys (pk_live_..., sk_live_...)
3. Create new webhook endpoint with live URL
4. Update Vercel env vars with live keys
5. Redeploy

---

## CUSTOM DOMAIN (Optional)

1. Buy domain (Namecheap, Cloudflare, wherever)
2. Vercel → Your Project → Settings → Domains
3. Add your domain
4. Update DNS as instructed
5. Update `NEXT_PUBLIC_APP_URL` to your domain
6. Update Stripe webhook URL to your domain
7. Redeploy

---

## TROUBLESHOOTING

**Webhook not working?**
- Check Stripe Dashboard → Webhooks → Recent events
- Check Vercel → Deployments → Functions → api/webhook logs

**Magic link not sending?**
- Check Vercel logs for the console.log with the link
- In production, integrate Resend or similar

**Database errors?**
- Make sure you ran the full schema.sql
- Check Supabase → Logs → Postgres logs

**Build failing?**
- Check you have all env vars set
- Run `npm run build` locally to see errors

---

## YOU'RE LIVE

Your Footprint is now:
- Taking $10 payments
- Creating users with serial numbers
- Serving public pages
- Generating QR codes and embeds
- Tracking analytics

Go get users.
