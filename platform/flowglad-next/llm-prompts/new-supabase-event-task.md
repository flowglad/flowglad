All of the following changes will happen in the directory `./packages/flowglad-next`, so when you see a path like `./src/db/schema/unicornRiders.ts`, it should be translated to `./packages/flowglad-next/src/db/schema/unicornRiders.ts`.

You're creating a new trigger task for a Supabase event.

Here's what you need to do, assuming the table is named "InvoiceLineItems" (the actual name will be provided to you by the prompt - "Invoices" is just an example):
- Create a new file at `./src/trigger/supabase/invoice-line-item-updated.ts` directory. The file will be named table-name-[inserted|updated|deleted].ts, using kebab-case.
- Inside the file, create a new trigger task, in the following shape:
```ts
import { logger, task, wait } from '@trigger.dev/sdk'
import { InvoiceLineItemRecord } from '@/db/schema/invoiceLineItems'
/* 
Note: if the event is an insert, the payload will be a SupabaseInsertPayload. 
If the event is an update, the payload will be a SupabaseUpdatePayload.
*/
import { SupabaseUpdatePayload } from '@/types'
import { supabaseUpdatePayloadSchema } from '@/db/supabase'
import { invoiceLineItemSelectSchema } from '@/db/schema/invoiceLineItems'

const invoiceLineItemUpdateSchema = supabaseUpdatePayloadSchema(
  invoiceLineItemSelectSchema
)
export const invoiceLineItemUpdatedTask = task({
  id: 'invoice-line-item-updated',
  run: async (payload: SupabaseUpdatePayload, { ctx }) => {
    logger.log({ payload, ctx })
    const parsedPayload = invoiceLineItemUpdateSchema.safeParse(payload)
    if (!parsedPayload.success) {
      logger.error(parsedPayload.error.message)
      parsedPayload.error.issues.forEach((issue) => {
        logger.error(`${issue.path.join('.')}: ${issue.message}`)
      })
      throw new Error('Invalid payload')
    }
    const { old_record: oldRecord, record: newRecord } = parsedPayload.data
    // the logic required according to the prompt here...
    return {
      message: 'OK',
    }
  },
})
```
- In the task, all of your database operations should be wrapped in an `adminTransaction` call. Import the `adminTransaction` function from `@/db/authenticatedTransaction`:
```ts
    const result = await adminTransaction(async ({ transaction }) => {
      // all database operations here...
      
    })
```
- In `webhook-supabase/route.ts`, add the new event case to the switch statement. Import the newly created trigger task and invoke it with the payload provided:
```ts
case `InvoiceLineItems:${SupabasePayloadType.UPDATE \* or SupabasePayloadType.INSERT for insert events *\}`:
  await invoiceLineItemUpdatedTask.trigger(
    body.data as SupabaseUpdatePayload
  )
  break
```

# Specific Considerations, Based on Payload Type
- If the event is an update, you will likely need to check fields between `old_record` and `record` to determine if the update requires any action. If you need to condition against a specific field changing multiple times, just create a method for it inside the trigger task file. If you create this method, you should use the following function signature: `(params: { oldRecord: InvoiceLineItemRecord, newRecord: InvoiceLineItemRecord }) => boolean`
```ts
const invoiceLineItemQuantityUpdated = (params: { oldRecord: InvoiceLineItemRecord, newRecord: InvoiceLineItemRecord }) => {
    const { oldRecord, newRecord } = params
    return oldRecord.quantity !== newRecord.quantity
}
```