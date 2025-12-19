# FOOTPRINT → ARO PIPELINE

```
┌─────────────────────────────────────────────────────────────────┐
│                         FOOTPRINT                               │
│                    Human-Facing Capture                         │
│                                                                 │
│   User sees page → Pays $10 → Gets serial → Creates footprint  │
│                              ↓                                  │
│                         Stripe                                  │
│                              ↓                                  │
│                      $9.40 net/sale                             │
│                     (after 2.9% + 30¢)                          │
└─────────────────────────────────────────────────────────────────┘
                               ↓
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                           ARO                                   │
│               Autonomous Revenue Organism                       │
│                                                                 │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│   │   DEX   │ │ Content │ │ Ticket  │ │ Domain  │              │
│   │   Arb   │ │ Repost  │ │   Arb   │ │  Drops  │              │
│   └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘              │
│        │           │           │           │                    │
│        └───────────┴───────────┴───────────┘                    │
│                        ↓                                        │
│                  SQL Brain                                      │
│           (fitness scoring, lane allocation)                    │
│                        ↓                                        │
│              95% Compound / 5% Extract                          │
└─────────────────────────────────────────────────────────────────┘
```

## The Math

**Footprint Revenue:**
- 10 sales/day = $94/day net
- 100 sales/day = $940/day net
- 1000 sales/day = $9,400/day net

**ARO Seed:**
- Start with $1000 from first ~106 Footprint sales
- ARO compounds at computational speed
- Footprint keeps feeding the pool

**Compound Table (theoretical 5% daily ARO yield):**
| Day | Footprint Revenue | ARO Pool | Total |
|-----|-------------------|----------|-------|
| 0   | $0                | $1,000   | $1,000 |
| 7   | $658              | $1,407   | $2,065 |
| 30  | $2,820            | $4,322   | $7,142 |
| 90  | $8,460            | $80,730  | $89,190 |

*Assumes 10 sales/day average, 5% daily ARO yield (aggressive but illustrative)*

## Integration Points

### 1. Auto-Transfer to ARO Wallet

```javascript
// In your Stripe webhook, after successful payment:
async function onPaymentSuccess(session) {
  // ... create user, claim serial, etc.
  
  // Queue for ARO transfer (daily batch)
  await supabase.from('aro_queue').insert({
    amount: session.amount_total - 30, // net of Stripe fees
    source: 'footprint',
    status: 'pending'
  });
}
```

### 2. Daily ARO Feed Script

```javascript
// Cron job: sweep Stripe balance to ARO wallet
async function dailyAROFeed() {
  const balance = await stripe.balance.retrieve();
  const available = balance.available[0].amount;
  
  if (available > 10000) { // $100 minimum
    // Transfer to ARO operational wallet
    await stripe.transfers.create({
      amount: Math.floor(available * 0.95), // Keep 5% buffer
      currency: 'usd',
      destination: process.env.ARO_STRIPE_ACCOUNT
    });
  }
}
```

### 3. ARO Status Dashboard

Add to Footprint dashboard (for you only):

```javascript
// app/(protected)/aro/page.tsx
export default async function ARODashboard() {
  const stats = await getAROStats();
  
  return (
    <div>
      <h1>ARO Status</h1>
      <div>Footprint Revenue (30d): ${stats.footprintRevenue}</div>
      <div>ARO Pool Size: ${stats.aroPool}</div>
      <div>Active Lanes: {stats.activeLanes}</div>
      <div>24h Yield: {stats.dailyYield}%</div>
    </div>
  );
}
```

## Footprint is the Primitive

The insight: **Footprint doesn't need to scale massively to matter.**

Even at modest adoption (100 users), it generates consistent seed capital for ARO. The beauty is:

1. **One-time revenue** - No churn, no subscriptions to maintain
2. **Zero marginal cost** - Each additional sale is pure margin
3. **Viral mechanics built-in** - Every footprint advertises Footprint
4. **ARO multiplier** - $940/day becomes whatever ARO can compound it to

Footprint is the on-ramp. ARO is the engine. Together: autonomous wealth generation with a human-friendly interface.

## Next Steps

1. **Deploy Footprint** (today)
2. **Get 10 sales** (this week) 
3. **Hit $1000 seed** (~106 sales)
4. **Activate ARO lanes** (when capital ready)
5. **Let it run**

The first $10 sale is the hardest. After that, it's just watching the numbers compound.
