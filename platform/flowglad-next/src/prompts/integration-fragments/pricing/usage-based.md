
- For `checkUsageBalance` (available on client & server): provide the `usageMeterSlug` to check for and optionally refine the result to a specific subscription by passing in a `subscriptionId` for `refinementParams`. Returns either `{ availableBalance: number }` or `null` if not found.
- For `createUsageEvent` (server only): provide `{amount: number, priceId: string, subscriptionId: string, usageMeterId: string, transactionId: string, properties?: Record<string, unknown>, usageDate?: number}`. The `properties` field is **required** for usage meters with `count_distinct_properties` aggregation type - it must be a non-empty object identifying the distinct combination being counted (e.g., `{ user_id: '123' }`). For other aggregation types, `properties` is optional. See [here](/api-reference/usage-events/create-usage-event#body-usage-event) for more details on the parameters.

### Example: Usage Balance Check

<Tabs>
  <Tab title="Client">

  ```tsx
  'use client'

  import { useBilling } from '@flowglad/nextjs'

  export function UsageBalanceIndicator({
    usageMeterSlug,
  }: {
    usageMeterSlug: string
  }) {
    const {
      loaded,
      errors,
      checkUsageBalance,
    } = useBilling()

    if (!loaded || !checkUsageBalance) {
      return <p>Loading usage…</p>
    }

    if (errors) {
      return <p>Unable to load billing data right now.</p>
    }

    const usage = checkUsageBalance(usageMeterSlug)

    return (
      <div>
        <h3>Usage Balance</h3>
        <p>
          Remaining:{' '}
          {usage ? `${usage.availableBalance} credits` : 'No usage meter found'}
        </p>
      </div>
    )
  }
  ```

  </Tab>
  <Tab title="Server">

  ```ts
  import { NextResponse } from 'next/server'
  import { FlowgladServer } from '@flowglad/server'
  import { getSessionUser } from '@/lib/auth'

  const flowgladServer = new FlowgladServer({
    apiKey: process.env.FLOWGLAD_SECRET_KEY,
    getRequestingCustomer: async () => {
      const user = await getSessionUser()
      if (!user) {
        throw new Error('Unauthorized')
      }

      return {
        externalId: user.id,
        email: user.email,
        name: user.name,
      }
    },
  })

  export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const usageMeterSlug = searchParams.get('usageMeterSlug') ?? 'api-calls'

    const billing = await flowgladServer.getBilling()
    const usage = billing.checkUsageBalance(usageMeterSlug)

    return NextResponse.json({
      usageMeterSlug,
      remaining: usage?.availableBalance ?? null,
    })
  }
  ```
  </Tab>
</Tabs>

### Example: Recording Usage from the Server

```ts
import Fastify from 'fastify'
import {
  FlowgladServer,
  type CreateUsageEventParams,
} from '@flowglad/server'
import { getSessionUser } from './auth'

const fastify = Fastify()

const flowgladServer = new FlowgladServer({
  apiKey: process.env.FLOWGLAD_SECRET_KEY,
  getRequestingCustomer: async () => {
    const user = await getSessionUser()
    if (!user) {
      throw new Error('Unauthorized')
    }

    return {
      externalId: user.id,
      email: user.email,
      name: user.name,
    }
  },
})

fastify.post('/api/usage', async (request, reply) => {
  const {
    amount,
    priceId,
    subscriptionId,
    usageMeterId,
    transactionId,
    usageDate,
    properties,
  } = request.body as CreateUsageEventParams

  const usageEvent = await flowgladServer.createUsageEvent({
    amount,
    priceId,
    subscriptionId,
    usageMeterId,
    transactionId,
    usageDate: usageDate ?? Date.now(),
    properties,
  })

  reply.send({ usageEvent })
})

fastify.listen({ port: 3000 })
```
