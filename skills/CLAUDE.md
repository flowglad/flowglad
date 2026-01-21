# Flowglad Skills

Skills for integrating Flowglad billing into applications.

## Repository Structure

```
skills/
├── setup/SKILL.md           # SDK installation and configuration
├── feature-gating/SKILL.md  # Feature access checks
├── checkout/SKILL.md        # Purchase and checkout flows
├── usage-tracking/SKILL.md  # Metered billing implementation
├── subscriptions/SKILL.md   # Subscription lifecycle management
└── pricing-ui/SKILL.md      # Pricing page components
```

## When to Use These Skills

Use these skills when the user wants to:
- Add Flowglad billing to their application
- Implement paywalls or premium features
- Create checkout/upgrade flows
- Track usage for metered billing
- Build subscription management UI
- Display pricing information

## Skill Selection

| User Intent | Skill |
|-------------|-------|
| "Add billing to my app" | setup |
| "Set up Flowglad" | setup |
| "Gate this feature for paid users" | feature-gating |
| "Add a paywall" | feature-gating |
| "Create upgrade button" | checkout |
| "Build pricing page" | checkout, pricing-ui |
| "Track API usage" | usage-tracking |
| "Add metered billing" | usage-tracking |
| "Let users cancel subscription" | subscriptions |
| "Add plan upgrade/downgrade" | subscriptions |

## Framework Detection

Before using setup skill, detect the user's framework:

- **Next.js**: `next.config.js` or `next.config.ts` exists
- **Express**: `express` in package.json dependencies
- **React (other)**: React app without Next.js

## Important Conventions

1. **Use slugs, not IDs**: Reference prices and products by slug (e.g., `priceSlug: 'pro-monthly'`)
2. **Customer IDs are yours**: Pass your app's user/org ID, not Flowglad's
3. **Reload after mutations**: Call `billing.reload()` after subscription changes
4. **Server-side for usage**: Record usage events server-side for security
