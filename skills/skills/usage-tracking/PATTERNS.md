# Usage Tracking Patterns

Reusable patterns referenced by the usage-tracking skill.

## InsufficientCreditsError

A typed error class for handling insufficient balance scenarios in API routes:

```typescript
class InsufficientCreditsError extends Error {
  constructor(
    public meterSlug: string,
    public availableBalance: number,
    public required: number
  ) {
    super(
      `Insufficient credits for ${meterSlug}. ` +
      `Available: ${availableBalance}, Required: ${required}`
    )
    this.name = 'InsufficientCreditsError'
  }
}
```

### API Route Error Handling

```typescript
export async function POST(req: Request) {
  try {
    const result = await generateImage(userId, prompt)
    return Response.json(result)
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return Response.json(
        {
          error: 'insufficient_credits',
          message: error.message,
          availableBalance: error.availableBalance,
          required: error.required,
          upgradeUrl: '/pricing',
        },
        { status: 402 }
      )
    }
    throw error
  }
}
```

## Hash-Based Transaction ID Generation

For deterministic operations where no natural ID exists, hash the operation parameters:

```typescript
import { createHash } from 'crypto'

function hashOperationParams(params: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex')
    .slice(0, 16)
}

const operationHash = hashOperationParams({ userId, prompt })
await flowglad(userId).createUsageEvent({
  usageMeterSlug: 'queries',
  amount: 1,
  transactionId: `query_${operationHash}`,
})
```

### Alternative: Request ID Header

If your client sends a stable `x-request-id` on retries:

```typescript
const requestId = req.headers.get('x-request-id')
if (!requestId) {
  return Response.json({ error: 'x-request-id header required' }, { status: 400 })
}
await flowglad(userId).createUsageEvent({
  usageMeterSlug: 'api-calls',
  amount: 1,
  transactionId: `req_${requestId}`,
})
```
