<p align="center">
  <a href="https://github.com/flowglad/flowglad">
    <img width="1440" alt="1440w light" src="https://github.com/user-attachments/assets/4dea09ea-91c9-4233-a4ac-cef513bbb927" />
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
    <a href="https://github.com/flowglad/flowglad/issues">Issues</a>
    ·
    <a href="https://app.flowglad.com/invite-discord">Discord</a>
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
    The payment processor for natural language programming.
  </p>
  <p>
    Infinite pricing models, one source of truth, zero webhooks.
  </p>
</div>

![nav-demo](/./public/nat-lang-demo.gif)

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

# Vite Projects
bun add @flowglad/react @flowglad/server
```

Flowglad couples tightly with your auth. Here are some prompts that you can use to integrate Flowglad, based on your auth provider, in about 30 seconds:

<details>
<summary><strong>Clerk</strong></summary>

```txt
Please set up billing for our app according to the following instructions. Note that this assumes a Next.js application. If our project uses a different stack, you will need to adapt it accordingly. Specifically, you will need to change the following:
`bash
# replace @flowglad/nextjs with @flowglad/react and @flowglad/server
bun add @flowglad/react @flowglad/server # or whatever package manager we use
`

`ts
// replace all imports of @flowglad/nextjs/server -> @flowglad/server
import { FlowgladServer } from '@flowglad/server'
`

1. Create a `flowglad.ts` file in /src, that looks like this:

`// flowglad.ts
import { FlowgladServer } from '@flowglad/nextjs/server'
import { currentUser } from '@clerk/nextjs/server'

export const flowgladServer = new FlowgladServer({
  clerk: {
    currentUser,
  },
})
`
<Important>
If your customers are organizations rather than individual users, you should use the `getRequestingCustomer` initializer method:

`ts flowglad.ts
import { FlowgladServer } from '@flowglad/nextjs/server'

export const flowgladServer = new FlowgladServer({
  getRequestingCustomer: () => {
   // whatever logic you currently use to 
   // derive the organization associated with a given request
  }
})

`
</Important>

2. Create a route handler at `/api/flowglad/[...path]/route.ts`:

`// /api/flowglad/[...path]/route.ts
'use server'
import { createAppRouterRouteHandler } from '@flowglad/nextjs/server'
import { flowgladServer } from '@/flowglad'

const routeHandler = createAppRouterRouteHandler(flowgladServer)

export { routeHandler as GET, routeHandler as POST }
`

3. Add the following to the`app/layout.tsx`file. Preserve the existing layout JSX code. Just:

- get the user via clerk auth
- mount the `FlowgladProvider` with the user
- pass the user to the `FlowgladProvider`

`
// /app/layout.tsx
import { currentUser } from '@clerk/nextjs/server'
// ... existing code ...
// inside of the layout component:
const user = await currentUser()

return (

<FlowgladProvider loadBilling={!!user}>
  {/* ... existing layout JSX ... */}
  {children}
  {/* ... existing layout JSX ... */}
</FlowgladProvider>
) `
```
</details>
<details>
<summary><strong>Supabase Auth</strong></summary>

```txt
Please set up billing for our app according to the following instructions. Note that this assumes a Next.js application. If our project uses a different stack, you will need to adapt it accordingly. Specifically, you will need to change the following:
`bash
# replace @flowglad/nextjs with @flowglad/react and @flowglad/server
bun add @flowglad/react @flowglad/server # or whatever package manager we use
`

`ts
// replace all imports of @flowglad/nextjs/server -> @flowglad/server
import { FlowgladServer } from '@flowglad/server'
`

1. Create a `flowglad.ts` file in your project directory, that looks like this:

`ts
import { FlowgladServer } from '@flowglad/nextjs/server'
import { createClient } from '@/utils/supabase/server' // or wherever you store your supabase server client constructor.

export const flowgladServer = new FlowgladServer({
  supabaseAuth: {
    client: createClient,
  },
})
`

#### IMPORTANT NOTE
If your customers are organizations rather than individual users, you should use the `getRequestingCustomer` initializer method:
`ts flowglad.ts
import { FlowgladServer } from '@flowglad/nextjs/server'

export const flowgladServer = new FlowgladServer({
  getRequestingCustomer: () => {
   // whatever logic you currently use to 
   // derive the organization associated with a given request
  }
})

`


2. Create a route handler at `/api/flowglad/[...path]/route.ts`:

`ts
import { createAppRouterRouteHandler } from '@flowglad/nextjs/server'
import { flowgladServer } from '@/flowglad'

const routeHandler = createAppRouterRouteHandler(flowgladServer)

export { routeHandler as GET, routeHandler as POST }
`

3. Add the following to the`app/layout.tsx`file. Preserve the existing layout JSX code. Just:

- get the user via supabase auth
- mount the `FlowgladProvider` with the user
- pass the user to the `FlowgladProvider`

`tsx
// /app/layout.tsx
import { createClient } from '@/utils/supabase/server' // or wherever we create our supabase client
// ... existing code ...
// inside of the layout component:
const supabase = createClient()
const {
data: { user }
} = await supabase.auth.getUser()

return (
<FlowgladProvider loadBilling={!!user}>
  {/* ... existing layout JSX ... */}
  {children}
  {/* ... existing layout JSX ... */}
</FlowgladProvider>
)
`
```
</details>
<details>
<summary><strong>Next Auth</strong></summary>

```txt
Please set up billing for our app according to the following instructions. Note that this assumes a Next.js application. If our project uses a different stack, you will need to adapt it accordingly. Specifically, you will need to change the following:
`bash
# replace @flowglad/nextjs with @flowglad/react and @flowglad/server
bun add @flowglad/react @flowglad/server # or whatever package manager we use
`

`ts
// replace all imports of @flowglad/nextjs/server -> @flowglad/server
import { FlowgladServer } from '@flowglad/server'
`

1. Create a `flowglad.ts` file in /src, that looks like this:

`// flowglad.ts
import { FlowgladServer } from '@flowglad/nextjs/server'
import { auth } from '@/auth' // your initialized, configured NextAuth client

export const flowgladServer = new FlowgladServer({
  nextAuth: {
    auth,
  },
})
`

<Important>
If your customers are organizations rather than individual users, you should use the `getRequestingCustomer` initializer method:

`ts flowglad.ts
import { FlowgladServer } from '@flowglad/nextjs/server'

export const flowgladServer = new FlowgladServer({
  getRequestingCustomer: () => {
   // whatever logic you currently use to 
   // derive the organization associated with a given request
  }
})

`
</Important>

2. Create a route handler at `/api/flowglad/[...path]/route.ts`:

`// /api/flowglad/[...path]/route.ts
'use server'
import { createAppRouterRouteHandler } from '@flowglad/nextjs/server'
import { flowgladServer } from '@/flowglad'

const routeHandler = createAppRouterRouteHandler(flowgladServer)

export { routeHandler as GET, routeHandler as POST }
`

3. Add the following to the`app/layout.tsx`file. Preserve the existing layout JSX code. Just:

- get the session via next-auth
- mount the `FlowgladProvider` with the session status
- wrap everything in SessionProvider

`
// /app/layout.tsx
import { auth } from '@/auth'
import { SessionProvider } from 'next-auth/react'
// ... existing code ...
// inside of the layout component:
const session = await auth()

return (

<SessionProvider session={session}>
  <FlowgladProvider
    loadBilling={session?.status === 'authenticated'}
  >
    {/* ... existing layout JSX ... */}
    {children}
    {/* ... existing layout JSX ... */}
  </FlowgladProvider>
</SessionProvider>
) `
```
</details>

## Language & Framework SDK Coverage

Flowglad aims to have first class support for every language and framework that developers build in.

If we haven't gotten to your tool of choice yet, we have a [REST API](https://docs.flowglad.com/api-reference/introduction) that anyone can integrate as a fallback.

Here's our progress thus far. If you don't see your framework or language on here, please let us know in [our Discord](https://discord.gg/zsvkVtTXge)!

| Framework   | Support |
|-------------|---------|
| Next.js     | ✅      |
| Express     | ✅      |
| React       | ✅      |
| Remix       | 🟡      |
| Astro       | 🟡      |
| Hono        | 🟡      |
| Vue         | 🟡      |

## Authentication Services
Flowglad couples tightly with your authentication layer, automatically mapping your notion of customers to our notion of customers. To make this effortless, we have adapters for many popular auth services.

If you have a custom auth setup or need to support team-based billing, you can tell Flowglad how to derive the customer record on your server by setting `getRequestingCustomer`.

| Authentication Service | Support |
|------------------------|---------|
| Supabase Auth          | ✅      |
| Clerk                  | ✅      |
| NextAuth               | ✅      |
| Better Auth            | 🟡      |
| Firebase Auth          | 🟡      |


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

## Other languages

This README is also [available in Brazilian Portuguese](README.pt-BR.md).
