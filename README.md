<p align="center">
  <a href="https://github.com/flowglad/flowglad">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="./public/github-image-banner-dark-mode.jpg">
      <source media="(prefers-color-scheme: light)" srcset="./public/github-image-banner-light-mode.jpg">
      <img width="1440" alt="Flowglad Banner" src="./public/github-image-banner-light-mode.jpg">
    </picture>
  </a>

  <h3 align="center">Flowglad</h3>

  <p align="center">
    The easiest way to make internet money.
    <br />
    <a href="https://flowglad.com"><strong>Get Started</strong></a>
    <br />
    <br />
    ·
    <a href="https://docs.flowglad.com/quickstart">Quickstart</a>
    ·
    <a href="https://flowglad.com">Website</a>
    ·
    <a href="https://luma.com/flowglad">Events</a>
    ·
    <a href="https://github.com/flowglad/flowglad/issues">Issues</a>
    ·
    <a href="https://github.com/flowglad/examples">Examples</a>
    ·
  </p>
</p>

<p align="center">
  <a href="https://app.flowglad.com/invite-discord">
    <img src="https://img.shields.io/badge/chat-on%20discord-7289DA.svg" alt="Join Discord Community" />
  </a>
  <a href="https://twitter.com/intent/follow?screen_name=flowglad">
    <img src="https://img.shields.io/twitter/follow/flowglad.svg?label=Follow%20@flowglad" alt="Follow @flowglad" />
  </a>
  <a href="https://www.ycombinator.com/companies/flowglad">
    <img src="https://img.shields.io/badge/Backed%20by%20YC-FF4000" alt="Backed by YC" />
  </a>
</p>
<div align="center">
  <p>
    Infinite pricing models, one source of truth, zero webhooks.
  </p>
</div>

![nav-demo](/./public/fg-demo.gif)

## Features

- **Default Stateless** Say goodbye to webhooks, `"subscriptions"` db tables, `customer_id` columns, `PRICE_ID` env variables, or manually mapping your plans to prices to features and back.
- **Single Source of Truth:** Read your latest customer billing state from Flowglad, including feature access and usage meter credits
- **Access Data Using Your Ids:** Query customer state by your auth's user ids. Refer to prices, features, and usage meters via slugs you define.
- **Full-Stack SDK:** Access your customer's data on the backend using `flowgladServer.getBilling()`, or in your React frontend using our `useBilling()` hook
- **Adaptable:** Iterate on new pricing models in testmode, and push them to prod in a click. Seamlessly rotate pricing models in your app without any redeployment.

## Set Up

### Installation

First, install the packages necessary Flowglad packages based on your project setup:
```bash
# Next.js Projects
bun add @flowglad/nextjs

# React + Express projects:
bun add @flowglad/react @flowglad/express

# All other React + Node Projects
bun add @flowglad/react @flowglad/server
```

Flowglad integrates seamlessly with your authentication system and requires only a few lines of code to get started in your Next.js app. Setup typically takes under a minute:

### Integration
1. **Configure Your Flowglad Server Client**

Create a utility to generate your Flowglad server instance. Pass your own customer/user/organization IDs—Flowglad never requires its own customer IDs to be managed in your app:

```ts
// utils/flowglad.ts
import { FlowgladServer } from '@flowglad/nextjs/server'

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId) => {
      // e.g. Fetch user info from your DB using your user/org/team ID
      const user = await db.users.findOne({ id: externalId })
      if (!user) throw new Error('User not found')
      return { email: user.email, name: user.name }
    },
  })
}
```

2. **Expose the Flowglad API Handler**

Add an API route so the Flowglad client can communicate securely with your backend:

```ts
// app/api/flowglad/[...path]/route.ts
import { nextRouteHandler } from '@flowglad/nextjs/server'
import { flowglad } from '@/utils/flowglad'

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async (req) => {
    // Extract your user/org/team ID from session/auth.
    // For B2C: return user.id from your DB
    // For B2B: return organization.id or team.id
    const userId = await getUserIdFromRequest(req)
    if (!userId) throw new Error('User not authenticated')
    return userId
  },
})
```

3. **Wrap Your App with the Provider**

In your root layout (App Router) or _app (Pages Router):

```tsx
import { FlowgladProvider } from '@flowglad/nextjs'

// App Router example (app/layout.tsx)
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <FlowgladProvider loadBilling={true}>
          {children}
        </FlowgladProvider>
      </body>
    </html>
  )
}
```

That’s it—Flowglad will use your app’s internal user IDs for all billing logic and integrate billing status into your frontend in real time.

**B2C apps:** Use `user.id` as the customer ID.  
**B2B apps:** Use `organization.id` or `team.id` as the customer ID.

_Flowglad does not require you to change your authentication system or manage Flowglad customer IDs. Just pass your own!_

4. Use `useBilling` on your frontend, and `flowglad(userId).getBilling()` on your backend

### Frontend Example: Checking Feature Access and Usage
```tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

export function FeatureGate({ featureSlug, children }) {
  const { loaded, errors, checkFeatureAccess } = useBilling()

  if (!loaded || !checkFeatureAccess) {
    return <p>Loading billing state…</p>
  }

  if (errors?.length) {
    return <p>Unable to load billing data right now.</p>
  }

  return checkFeatureAccess(featureSlug)
    ? children
    : <p>You need to upgrade to unlock this feature.</p>
}
```

```tsx
import { useBilling } from '@flowglad/nextjs'

export function UsageBalanceIndicator({ usageMeterSlug }) {
  const { loaded, errors, checkUsageBalance, createCheckoutSession } = useBilling()

  if (!loaded || !checkUsageBalance) {
    return <p>Loading usage…</p>
  }

  const usage = checkUsageBalance(usageMeterSlug)

  return (
    <div>
      <h3>Usage Balance</h3>
      <p>
        Remaining:{' '}
        {usage ? `${usage.availableBalance} credits available` : <button onClick={() => createCheckoutSession({ 
            priceSlug: 'pro_plan',
            autoRedirect: true
          })}
        />}
      </p>
    </div>
  )
}
```

### Backend Example: Server-side Feature and Usage Checks
```ts
import { NextResponse } from 'next/server'
import { flowglad } from '@/utils/flowglad'

const hasFastGenerations = async () => {
  // ...
  const user = await getUser()

  const billing = await flowglad(user.id).getBilling()
  const hasAccess = billing.checkFeatureAccess('fast_generations')
  if (hasAccess) {
    // run fast generations
  } else {
    // fall back to normal generations
  }
}
```

```ts
import { flowglad } from '@/utils/flowglad'

const processChatMessage = async (params: { chat: string }) => {
  // Extract your app's user/org/team ID,
  // whichever corresponds to your customer
  const user = await getUser()

  const billing = await flowglad(user.id).getBilling()
  const usage = billing.checkUsageBalance('chat_messages')
  if (usage.availableBalance > 0) {
    // run chat request
  } else {
    throw Error(`User ${user.id} does not have sufficient usage credits`)
  }
}
```

## Getting Started
First, set up a pricing model. You can do so in the [dashboard](https://app.flowglad.com/pricing-models) in just a few clicks using a template, that you can then customize to suit your specific needs.

We currently have templates for the following pricing models:
- Usage-limit + Subscription Hybrid (like Cursor)
- Unlimited Usage (like ChatGPT consumer)
- Tiered Access and Usage Credits (like Midjourney)
- Feature-Gated Subscription (like Linear)

And more on the way. If you don't see a pricing model from our templates that suits you, you can always make one from scratch. 



## Examples

- [Generation-Based Subscription](https://github.com/flowglad/examples/tree/main/generation-based-subscription)
- [Tiered Usage-Gated Subscription](https://github.com/flowglad/examples/tree/main/tiered-usage-gated-subscription)
- [Usage Limit Subscription](https://github.com/flowglad/examples/tree/main/usage-limit-subscription)

## Built With

- [Next.js](https://nextjs.org/?ref=flowglad.com)
- [tRPC](https://trpc.io/?ref=flowglad.com)
- [React.js](https://reactjs.org/?ref=flowglad.com)
- [Tailwind CSS](https://tailwindcss.com/?ref=flowglad.com)
- [Drizzle ORM](https://orm.drizzle.team/?ref=flowglad.com)
- [Zod](https://zod.dev/?ref=flowglad.com)
- [Trigger.dev](https://trigger.dev/?ref=flowglad.com)
- [Supabase](https://supabase.com/?ref=flowglad.com)
- [Better Auth](https://better-auth.com/?ref=flowglad.com)

## Project Goals

In the last 15 years, the market has given developers more options than ever for every single part of their stack. But when it comes to payments, there have been virtually zero new entrants. The existing options are slim, and almost all of them require us to talk to sales to even set up an account. When it comes to _self-serve_ payments, there are even fewer options.

The result? The developer experience and cost of payments has barely improved in that time. Best in class DX in payments feels eerily suspended in 2015. Meanwhile, we've enjoyed constant improvements in auth, compute, hosting, and practically everything else.

Flowglad wants to change that.

We're building a payments layer that lets you:
- Think about billing and payments as little as possible
- Spend as little time on integration and maintenance as possible
- Get as much out of your single integration as possible
- Unlock more payment providers from a single integration

Achieving this mission will take time. It will be hard. It might even make some people unhappy. But with AI bringing more and more developers on line and exploding the complexity of startup billing, the need is more urgent than ever.

