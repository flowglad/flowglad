<p align="center">
  <a href="https://github.com/flowglad/flowglad">
    <img width="1440" alt="1440w light" src="https://github.com/user-attachments/assets/4dea09ea-91c9-4233-a4ac-cef513bbb927" />
  </a>

  <h3 align="center">Flowglad</h3>

  <p align="center">
    Open-source payment and billing for web devs & vibe coders
    <br />
    <a href="https://flowglad.com"><strong>Learn more »</strong></a>
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

## Demo: Integrating Flowglad in <40 seconds

https://github.com/user-attachments/assets/6480c847-4f59-482e-8549-8833c2e182fb

## Language & Framework SDK Coverage

Flowglad aims to have first class support for every language and framework that developers build in. If we haven't gotten to your tool of choice yet, we have a [REST API](https://docs.flowglad.com/api-reference/introduction) that anyone can integrate as a fallback.

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
| Deno        | 🟡      |
| Sveltekit   | 🟡      |
| Nuxt        | 🟡      |
| Fastify     | 🟡      |
| Python      | 🟡      |
| Django      | 🟡      |
| Golang      | 🟡      |
| React Native| 🟡      |

## Authentication Services
Flowglad couples tightly with your authentication layer, automatically mapping your notion of customers to our notion of customers. To make this effortless, we have adapters for many popular auth services.

If you have a custom auth setup or need to support team-based billing, you can tell Flowglad how to derive the customer record on your server by setting `getRequestingCustomer`.

| Authentication Service | Support |
|------------------------|---------|
| Supabase Auth          | ✅      |
| Clerk                  | ✅      |
| NextAuth               | ✅      |
| Better Auth            | 🟡      |
| Stack Auth             | 🟡      |
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
- [Stack Auth](https://stack-auth.com/?ref=flowglad.com)
