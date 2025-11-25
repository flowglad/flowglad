# Step 0: Prerequisites & Environment Setup

## Objective

Set up your environment with the necessary Flowglad credentials before integrating the SDK.

## Prerequisites

Before starting the Flowglad integration:

1. **Create a Flowglad account** at [https://app.flowglad.com/sign-up](https://app.flowglad.com/sign-up)
2. **Set up a pricing model** in the Flowglad dashboard with:
   - Products (your subscription tiers)
   - Prices (pricing for each product)
   - Features (optional: for feature gating)
   - Usage Meters (optional: for usage-based billing)

## Environment Variables

Add your Flowglad secret key to your environment:

```bash
# .env or .env.local
FLOWGLAD_SECRET_KEY="sk_test_..."
```

### Where to find your API key

1. Log in to [https://app.flowglad.com](https://app.flowglad.com)
2. Navigate to **Settings** > **API**
3. Copy your secret key (starts with `sk_test_` for test mode or `sk_live_` for production)

### Platform-specific setup

**Vercel:**
- Go to [Vercel Dashboard](https://vercel.com/dashboard)
- Select your project > Settings > Environment Variables
- Add `FLOWGLAD_SECRET_KEY` with your secret key

**Infisical:**
- Go to [Infisical Dashboard](https://app.infisical.com/dashboard)
- Add the secret to your project

**Local development:**
- Add to your `.env` or `.env.local` file
- Make sure `.env` is in your `.gitignore`

## Security Notes

- **Never commit your secret key to version control**
- **Never expose your secret key in client-side code**
- Use `sk_test_` keys for development/staging
- Use `sk_live_` keys for production only

## Verification

After setting up your environment variable, verify it's accessible:

```typescript
// Quick test (remove after verification)
console.log('Flowglad key exists:', !!process.env.FLOWGLAD_SECRET_KEY)
```

## Next Step

Once your environment is configured, proceed to **Step 1: Install Packages** to add the Flowglad SDK to your project.

