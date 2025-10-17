# Extract Billing Context Guide

**Purpose:** This guide provides systematic instructions for extracting and recreating the pricing & billing configurations of any company. The higher quality input and context you gather, the more accurate your pricing model template will be.

---

## 📋 Quick Reference Checklist

Before you begin, gather these materials:

- [ ] Company's public pricing page URL
- [ ] Pricing documentation/help center articles
- [ ] Stripe billing portal screenshots (if available)
- [ ] Sample invoices (multiple months preferred)
- [ ] Terms of service / pricing terms
- [ ] FAQ about billing/pricing
- [ ] User testimonials mentioning pricing details

---

## 🎯 Step 1: Gather High-Quality Inputs

### **A. Public Pricing Page**
**Where to find:** `company.com/pricing`

**What to extract:**
1. **Plan tiers**: Names, prices, billing intervals (monthly/yearly)
2. **Features per tier**: What's included in each plan
3. **Usage limits**: Request counts, storage limits, user seats, etc.
4. **Trial periods**: Free trial duration and what's included
5. **Add-ons**: Optional purchases beyond base plans
6. **Volume discounts**: Pricing changes at different usage levels

**Questions to answer:**
- Is there a free tier? What does it include?
- Which plans offer annual billing?
- Are there any "Contact Sales" or custom pricing tiers?
- What's the default/recommended plan?

**Example (Cursor):**
```
✅ Hobby: $0/mo
✅ Pro: $20/mo or $240/yr (14-day trial)
✅ Pro+: $60/mo (no annual option)
✅ Ultra: $200/mo (no annual option)
✅ Teams: $40/user/mo
✅ Enterprise: Custom pricing
```

---

### **B. Pricing Documentation**
**Where to find:** `docs.company.com`, `help.company.com`, `company.com/docs/pricing`

**What to extract:**
1. **Usage meters**: How usage is tracked and measured
2. **Rate limits**: Hard caps vs. soft limits
3. **Overage policies**: What happens when limits are exceeded
4. **Billing frequency**: When charges occur (monthly, real-time, etc.)
5. **Credit systems**: Do credits roll over? Do they expire?
6. **Proration rules**: How upgrades/downgrades are handled

**Critical questions:**
- How is usage measured? (requests, tokens, GB, hours, seats)
- What happens when users exceed limits?
  - Hard block?
  - Automatic overage charges?
  - Require plan upgrade?
- Are there different types of usage? (fast vs slow, premium vs standard)
- How often is usage billed? (real-time, daily, monthly)

**Example (Cursor findings):**
```
✅ Usage tracking: Token-based (input, output, cache write, cache read)
✅ Fast vs Slow models: Different limits
✅ Overages: Billed at cost (real-time invoicing)
✅ Credits: Renew monthly, don't roll over
✅ Rate limits: 500 fast requests (Pro), 1,500 (Pro+), 10,000 (Ultra)
```

---

### **C. Stripe Billing Portal Screenshots**
**Where to find:** Customer's Stripe billing portal (`billing.stripe.com`)

**What to capture:**
1. **Subscription list**: Active subscriptions with prices
2. **Invoice history**: Multiple months for pattern analysis
3. **Payment methods**: How customers pay
4. **Billing information**: Name, address, email

**Critical insights:**
- Do subscriptions and usage charges appear on separate invoices?
- How frequently are invoices generated?
- Are there multiple line items per invoice?
- What date patterns exist? (e.g., subscription on 23rd, usage throughout month)

**Example screenshots to request:**
```
📸 Screenshot 1: Current subscription details
   → Shows: "Cursor Pro Plus - $60.00 per month"

📸 Screenshot 2: Invoice history list
   → Shows: Multiple invoices with dates and amounts

📸 Screenshot 3: Sample invoice expanded
   → Shows: Detailed line items, quantities, descriptions
```

---

### **D. Sample Invoices (CRITICAL)**
**Where to find:** Stripe invoices, email receipts, billing portal

**What to analyze:**
1. **Invoice structure**: What line items appear?
2. **Pricing breakdown**: How are charges calculated?
3. **Usage details**: Granular usage metrics shown
4. **Billing patterns**: Timing of charges

**Request multiple invoices:**
- ✅ At least 3 months of history
- ✅ Include both subscription and usage invoices (if separate)
- ✅ Different billing periods (to see renewal patterns)
- ✅ Months with varying usage (low and high)

**What to extract from each invoice:**

```markdown
### Invoice #1: [Date]
**Total:** $X.XX
**Line Items:**
1. Item name: [description]
   - Quantity: X
   - Unit price: $X.XX
   - Subtotal: $X.XX
   - Metadata: [any additional details shown]
   
2. [Repeat for each line item]

**Key observations:**
- Is this a subscription charge or usage charge?
- What period does it cover?
- Any proration shown?
```

**Example (Cursor analysis):**
```
Invoice #UNKQYWBC-0006 (Sep 23, 2025):
├─ Cursor Pro Plus: $60.00
└─ Period: Sep 23 - Oct 23, 2025
→ This is the monthly subscription charge

Invoice #UNKQYWBC-0007 (Oct 7, 2025):
├─ 200 calls to non-max-claude-4-sonnet: $5.96
├─ 1,120 calls to non-max-claude-4.5-sonnet: $49.27
├─ 404 calls to claude-4.5-sonnet: $44.83
└─ Total: $100.06
→ This is pure usage billing (token consumption)

KEY FINDING: Separate billing streams!
- Subscription: Fixed, billed monthly on renewal date
- Usage: Variable, billed as usage occurs (real-time)
```

---

## 🔍 Step 2: Reverse Engineer the Billing Model

### **Identify the Pricing Model Type**

Based on your research, categorize the model:

#### **Type A: Usage-Limit Subscription** (like Cursor)
- Base subscription unlocks access
- Includes monthly usage credits
- Overages billed separately
- Example: Cursor, Anthropic, OpenAI

#### **Type B: Unlimited Usage Subscription** (like ChatGPT)
- Flat subscription fee
- Unlimited usage for paid tiers
- No metered billing
- Example: ChatGPT, Netflix, Spotify

#### **Type C: Pure Pay-as-You-Go** (like AWS)
- No subscription required
- Pay only for consumption
- Example: AWS, Cloudflare, Twilio

#### **Type D: Seat-Based Subscription** (like GitHub)
- Per-user pricing
- Features scale with plan tier
- Example: GitHub, Slack, Notion

#### **Type E: Freemium with Add-ons** (like Slack)
- Free tier + optional paid features
- One-time or recurring add-ons
- Example: Slack, Dropbox

#### **Type F: Hybrid Subscription + Usage** (like Stripe)
- Base subscription + metered usage
- Both charges on same invoice
- Example: Stripe, Twilio

#### **Type G: Credits Pack** (like OpenAI API)
- Purchase credit bundles
- Credits don't expire
- Example: OpenAI API, AWS credits

---

## 📊 Step 3: Map to Template Structure

### **A. Define Usage Meters**

List all dimensions along which usage is tracked:

```typescript
usageMeters: [
  { slug: 'dimension-1', name: 'Display Name' },
  { slug: 'dimension-2', name: 'Display Name' },
]
```

**Common examples:**
- API calls/requests
- Tokens (input, output, cache)
- Storage (GB, TB)
- Bandwidth (GB transferred)
- Compute hours
- Active users/seats
- Messages sent
- Documents processed

**Cursor example:**
```typescript
usageMeters: [
  { slug: 'fast-premium-requests', name: 'Fast Premium Requests' },
]
```

**Note:** Don't over-complicate. If they track tokens but bill by request, use requests as the meter.

---

### **B. Define Features**

Features represent what customers get. Two types:

#### **Toggle Features** (Boolean access)
Use when the feature is on/off:
```typescript
{
  type: FeatureType.Toggle,
  slug: 'background-agents',
  name: 'Background Agents',
  description: 'Background agents for proactive suggestions',
  active: true,
}
```

#### **Usage Credit Grant Features** (Metered allowances)
Use when the feature grants a specific amount of usage:
```typescript
{
  type: FeatureType.UsageCreditGrant,
  slug: 'pro-fast-requests',
  name: '500 Fast Premium Requests',
  description: '500 fast premium requests included per month',
  usageMeterSlug: 'fast-premium-requests',
  amount: 500,
  renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
  active: true,
}
```

**Naming convention:**
- Start with the amount: `"500 Fast Premium Requests"` NOT `"Fast Requests - Pro"`
- Be specific about what it grants
- Include renewal info in description

---

### **C. Define Products**

Each product = something a customer can purchase.

#### **Subscription Products**
```typescript
{
  product: {
    name: 'Pro',
    default: false,  // Only ONE product can be default (the free tier)
    description: '$20/mo + 500 fast requests included (overages at cost)',
    slug: 'pro',
    active: true,
    imageURL: null,
    displayFeatures: null,
    singularQuantityLabel: null,  // null for subscriptions
    pluralQuantityLabel: null,
  },
  prices: [
    {
      type: PriceType.Subscription,
      slug: 'pro-monthly',
      isDefault: true,
      name: 'Pro Plan (Monthly)',
      usageMeterId: null,  // null for subscription prices
      trialPeriodDays: 14,  // null if no trial
      usageEventsPerUnit: null,
      active: true,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 2000,  // Amount in cents ($20.00)
    },
  ],
  features: ['pro-fast-requests', 'unlimited-completions', 'background-agents'],
}
```

#### **Usage Products** (for overages/pay-as-you-go)
```typescript
{
  product: {
    name: 'Fast Request Overages',
    default: false,
    description: 'Additional fast requests billed at cost after included credits exhausted',
    slug: 'fast-request-overages',
    active: true,
    imageURL: null,
    displayFeatures: null,
    singularQuantityLabel: 'request',  // ← IMPORTANT for usage products
    pluralQuantityLabel: 'requests',
  },
  prices: [
    {
      type: PriceType.Usage,
      slug: 'fast-request-overage',
      isDefault: true,
      name: 'Fast Request Overage',
      usageMeterSlug: 'fast-premium-requests',  // ← Links to usage meter
      trialPeriodDays: null,
      usageEventsPerUnit: 1,  // How many events = 1 billable unit
      active: true,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 10,  // $0.10 per request
    },
  ],
  features: [],  // Usually empty for pure usage products
}
```

---

## 🔬 Step 4: Validate Your Work

### **Invoice Reconciliation**
Match your template structure to real invoices:

1. **Create a test invoice manually** based on your template
2. **Compare to real invoice** from the company
3. **Check each line item**:
   - Does the charge amount match?
   - Is the description similar?
   - Are quantities calculated correctly?
   - Do dates align with billing periods?

### **Common Discrepancies to Check:**

#### ❌ **Problem:** Subscription charges not showing up
**Cause:** Forgot to create subscription product  
**Fix:** Add base subscription product for each tier

#### ❌ **Problem:** Usage charges billed incorrectly
**Cause:** Wrong `usageEventsPerUnit` value  
**Fix:** Check if 1 event = 1 unit, or if they batch (e.g., per 1000 tokens)

#### ❌ **Problem:** Features not showing in preview
**Cause:** Feature slugs don't match in product's `features` array  
**Fix:** Verify feature slug references are correct

#### ❌ **Problem:** Usage meters not appearing in dropdowns
**Cause:** `usageMeterSlug` doesn't match actual meter slug  
**Fix:** Double-check slug spelling and case

#### ❌ **Problem:** Default product has trial period
**Cause:** Free plans can't have trials (backend validation error)  
**Fix:** Set `trialPeriodDays: null` on default products

---

## 🧪 Step 5: Test Edge Cases

### **Scenario Testing:**

1. **Free tier user** (month 1)
   - What do they get?
   - Any trial credits?
   - Expected charges: $0

2. **Upgrading user** (mid-month)
   - Proration rules?
   - Credits transferred?
   - Expected charges: Prorated amount + usage

3. **Power user** (exceeds limits)
   - What happens at limit?
   - Overage charges applied?
   - Expected charges: Base + overage

4. **Downgrading user**
   - Credits lost?
   - Immediate or end of period?
   - Expected charges: Depends on timing

5. **Annual subscriber**
   - Upfront or monthly billing?
   - Usage still billed separately?
   - Expected charges: Annual fee + usage (if applicable)

---

## 📝 Documentation Template

Use this template when documenting your findings:

```markdown
# [Company Name] Pricing Model Analysis

**Date:** [Date of analysis]
**Sources:** 
- Pricing page: [URL]
- Documentation: [URL]
- Invoices analyzed: [Count and date range]

## Summary
[Brief overview of pricing model type]

## Subscription Tiers

### [Tier Name] - $X/interval
- **Price:** $X/mo and/or $X/yr
- **Trial:** X days (or none)
- **Included usage:** X [units]
- **Features:**
  - Feature 1
  - Feature 2
  
[Repeat for each tier]

## Usage Tracking

### Usage Meters
| Meter | Unit | Tracking Method |
|-------|------|-----------------|
| [Name] | [unit] | [How it's measured] |

### Rate Limits
| Tier | Meter 1 | Meter 2 |
|------|---------|---------|
| Free | X units | Y units |
| Pro  | X units | Y units |

## Overage Handling
- **Method:** [Hard block / Overage charges / Require upgrade]
- **Pricing:** [If overages, what's the per-unit cost?]
- **Billing:** [When are overages billed?]

## Billing Patterns

### Invoice Analysis
Based on [X] months of invoices:

**Subscription Invoices:**
- Frequency: Monthly on [day]
- Amount: Fixed $X
- Line items: [Description]

**Usage Invoices:**
- Frequency: [Pattern observed]
- Amount: Variable
- Line items: [Breakdown]

**Key Finding:**
[Major insight about their billing model]

## Template Structure

### Usage Meters
```typescript
usageMeters: [
  { slug: 'meter-slug', name: 'Meter Name' },
]
```

### Features
[List each feature with type, amount, renewal frequency]

### Products
[List each product with prices and features]

## Special Considerations
- [Anything unique about their model]
- [Edge cases discovered]
- [Assumptions made]
```

---

## 🎓 Real Example: Cursor Analysis

### **What We Gathered:**

1. **Pricing Page** → Basic tier structure ($0, $20, $60, $200)
2. **Documentation** → Revealed "500 fast requests" limits, but unclear if included or total
3. **Stripe Portal Screenshot** → Showed "Cursor Pro Plus" subscription
4. **Invoice #1** (Sep 23) → $60.00 for "Cursor Pro Plus" (subscription)
5. **Invoice #2** (Oct 7) → $100.06 for token usage (separate from subscription!)

### **Critical Discoveries:**

#### **Discovery #1: Two Billing Streams**
Initial assumption: $20/mo includes $20 of usage  
Reality: $20/mo is access fee, usage billed separately

**Evidence:**
```
Sep 23: $60.00 → Cursor Pro Plus (subscription)
Oct 7:  $100.06 → Usage (200 + 1,120 + 404 token calls)
```

#### **Discovery #2: Token-Based, Not Request-Based**
Initial assumption: "500 fast requests" = 500 API calls  
Reality: Tracked by tokens (input/output/cache), billed at API cost

**Evidence:**
```
Invoice line item:
"200 token-based usage calls to non-max-claude-4-sonnet-thinking,
totalling: $5.96. Input tokens: 735,195, Output tokens: 72,511,
Cache write tokens: 472,458, Cache read tokens: 5,158,109"
```

#### **Discovery #3: Real-Time Usage Billing**
Initial assumption: Usage billed at month-end  
Reality: Multiple usage invoices generated throughout the month

**Evidence:**
```
Sep 3:  $20.02 (usage)
Sep 5:  $40.02 (usage)
Sep 10: $60.01 (usage)
Sep 17: $80.47 (usage)
```

### **Final Template Structure:**

```typescript
// 4 subscription products (access tiers)
- Hobby: $0/mo, 0 included requests
- Pro: $20/mo, 500 included requests  
- Pro+: $60/mo, 1,500 included requests (3x)
- Ultra: $200/mo, 10,000 included requests (20x)

// 1 usage product (overages)
- Fast Request Overages: $0.10/request (usage-based)

// Usage meter
- fast-premium-requests

// Features combine:
- Usage credit grants (monthly allowances)
- Toggle features (unlimited slow, completions, etc.)
```

---

## 💡 Pro Tips

### **1. Don't Trust Marketing Copy Alone**
Pricing pages often simplify. The invoices reveal the truth.

**Example:**
- Marketing: "500 fast requests included"
- Reality: Could mean 500 included OR 500 rate limit before throttling
- Invoices confirm: 500 included, then billed per-token

### **2. Look for Dual Billing Patterns**
Many SaaS products charge:
- Subscription for access (fixed)
- Usage for consumption (variable)

If you see two invoice types, you likely need both subscription + usage products.

### **3. Check Granularity Carefully**
Companies may track at fine granularity (tokens) but market at coarse granularity (requests).

**Simplification strategy:**
- Template: Use simpler metric (requests)
- Description: Note underlying complexity (token-based)
- Allows users to customize further if needed

### **4. Verify Trial Periods**
- Free tiers can't have trials (backend validation)
- Only paid plans should have `trialPeriodDays` set
- Hobby plan with "includes 14-day Pro trial" ≠ trial on Hobby itself

### **5. Annual Pricing Patterns**
Check if annual pricing exists for ALL tiers or only some.

**Cursor example:**
- Pro: Has annual ($240/yr)
- Pro+: Monthly only
- Ultra: Monthly only

Don't assume all tiers have annual options!

---

## 🚨 Common Pitfalls

### **Pitfall #1: Confusing Access with Usage**
```
❌ Wrong: "Pro plan includes $20 of usage"
✅ Right: "Pro plan: $20/mo subscription + 500 requests (overages at cost)"
```

### **Pitfall #2: Missing Overage Products**
```
❌ Wrong: Only model subscription tiers
✅ Right: Add usage product for overage billing
```

### **Pitfall #3: Incorrect Price Types**
```
❌ Wrong: Using Subscription type for pay-per-use
✅ Right: 
   - Subscription = recurring charge (monthly/yearly)
   - Usage = metered charge (per unit consumed)
   - SinglePayment = one-time purchase
```

### **Pitfall #4: Wrong Quantity Labels**
```
❌ Wrong: Usage product with no singularQuantityLabel
Result: Shows "$0.10/mo" instead of "$0.10/request"

✅ Right: Set singularQuantityLabel: 'request'
Result: Shows "$0.10/request"
```

### **Pitfall #5: Hardcoding Feature Amounts in Names**
```
❌ Wrong for old templates: "API Requests - Pro" (loses amount)
✅ Right for new templates: "500 API Requests" (clear amount)
```

---

## 🔄 Iterative Validation Process

1. **Draft initial template** from pricing page
2. **Review with documentation** → Update usage meters, limits
3. **Analyze invoices** → Discover billing patterns
4. **Revise template** → Match invoice structure
5. **Test duplication** → Create pricing model from template
6. **Compare to reality** → Does it match the company's model?
7. **Refine** → Iterate until accurate

---

## 📚 Research Checklist by Source

### **Pricing Page Research**
```
□ List all plan tiers (names, prices, intervals)
□ Identify default/free tier
□ Note which plans have annual billing
□ Extract usage limits per tier
□ List features per tier
□ Check for trial periods
□ Look for add-ons or à la carte options
□ Screenshot the page for reference
```

### **Documentation Research**
```
□ Search for "usage limits" or "rate limits"
□ Search for "billing" or "invoicing"
□ Search for "overages" or "additional usage"
□ Look for API pricing details
□ Check for proration policies
□ Review upgrade/downgrade rules
□ Find any billing FAQ sections
```

### **Invoice Analysis**
```
□ Collect at least 3 months of invoices
□ Note invoice dates and patterns
□ Extract all line item descriptions
□ Calculate per-unit costs
□ Identify subscription vs usage charges
□ Look for multiple invoices per month
□ Check for proration examples
□ Note any special line items
```

### **Stripe Portal Analysis**
```
□ Screenshot current subscription details
□ Screenshot invoice history
□ Screenshot expanded invoice
□ Note payment method info
□ Check for multiple subscriptions
□ Look for usage reporting dashboard
□ Check renewal dates
```

---

## 🎯 Output Format

After completing your research, create:

### **1. Analysis Document** (using template above)
Complete findings with sources and evidence

### **2. Template Code** (TypeScript)
The actual `PricingModelTemplate` object

### **3. Validation Notes**
What you tested and what worked/didn't work

### **4. Open Questions**
Anything unclear that needs follow-up

---

## 🤝 Asking for Help

When requesting input from the AI:

**Good prompt:**
> "I need to recreate [Company]'s pricing model. Here's what I've gathered:
> 1. Pricing page: [URL or screenshot]
> 2. Documentation: [Key excerpts]
> 3. Sample invoices: [Detailed breakdown]
> 
> Please analyze and help me map this to a pricing model template."

**Great prompt:**
> "I'm recreating Cursor's pricing model. I have:
> 1. Pricing page showing 4 tiers: $0, $20, $60, $200
> 2. Docs mentioning '500 fast requests' for Pro
> 3. Two invoices:
>    - Invoice A: $60 for 'Cursor Pro Plus' subscription
>    - Invoice B: $100.06 for token usage with breakdown
> 
> The invoices suggest separate billing streams. Can you help me:
> - Identify if this is subscription + usage hybrid?
> - Determine if '500 requests' are included credits or rate limits?
> - Map the token-based billing to our template structure?"

**Inadequate prompt:**
> "Create a Cursor pricing template"

---

## 🔑 Key Principles

1. **Primary source = Invoices** → Most accurate representation of billing reality
2. **Marketing ≠ Implementation** → Pricing pages simplify, invoices don't lie
3. **Validate everything** → Cross-reference multiple sources
4. **Simplify intelligently** → Capture essence without excess complexity
5. **Document assumptions** → Note what you inferred vs what you confirmed
6. **Test thoroughly** → Duplicate template and verify it matches reality

---

## 📖 Further Reading

- [Pricing Model Templates Overview](./pricing-model-templates.md)
- [Feature Types Documentation](./features.md)
- [Usage Meters Guide](./usage-meters.md)
- [Price Types Reference](./price-types.md)

---

## ✅ Success Criteria

Your pricing model template extraction is successful when:

- ✅ Template creates all necessary products, prices, features, and usage meters
- ✅ Feature names clearly show amounts (e.g., "500 Fast Requests")
- ✅ Price suffixes are correct (e.g., "$0.10/request" not "$0.10/mo")
- ✅ Usage meters are properly linked to features
- ✅ Trial periods match reality (and only on paid plans)
- ✅ Annual pricing exists only where offered
- ✅ Overages are modeled if they exist
- ✅ Invoice structure could be recreated from template
- ✅ No backend validation errors when duplicating
- ✅ Template clearly explains the billing model in description

---

**Last updated:** Based on Cursor pricing model analysis (October 2024)

