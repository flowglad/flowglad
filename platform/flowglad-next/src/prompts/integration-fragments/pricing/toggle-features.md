Flowglad tells you what features each of your customers can access.
In the @flowglad/react and @flowglad/server SDKs, you can use `checkFeatureAccess` to see whether a customer's subscription(s) grant them access to a boolean feature:

For `checkFeatureAccess` (available on client & server): provide the `featureSlug` to check for and optionally refine the result to a specific subscription by passing in a `subscriptionId` for `refinementParams`. Returns a boolean.

```ts
'use client'

import { useBilling } from '@flowglad/nextjs'

export function FeatureAccessGate({
featureSlug,
}: {
featureSlug: string
}) {
  const {
    loaded,
    errors,
    checkFeatureAccess,
  } = useBilling()

  if (!loaded || !checkFeatureAccess) {
    return <p>Loading billing state…</p>
  }

  if (errors) {
    return <p>Unable to load billing data right now.</p>
  }

  return (
    <div>
      <h3>Feature Access</h3>
      {checkFeatureAccess(featureSlug) ? (
        <p>You can use this feature ✨</p>
      ) : (
        <p>You need to upgrade to unlock this feature.</p>
      )}
    </div>
  )
}
```

