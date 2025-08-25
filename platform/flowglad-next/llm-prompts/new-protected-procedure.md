All of the following changes will happen in the directory `./packages/flowglad-next`, so when you see a path like `./src/db/schema/unicornRiders.ts`, it should be translated to `./packages/flowglad-next/src/db/schema/unicornRiders.ts`.

You are creating a new trpc protectedProcedure that will be a mutation. Refer to the TRPC docs for more information.

You can rely on the other protectedProcedures the directory @/server/mutations as reference patterns. Here is how it will look for example, for a mutation called editCustomer:

```ts
// in @/server/mutations/editCustomer.ts
import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { editCustomerSchema } from '@/db/schema/customers'
import { updateCustomer } from '@/db/tableMethods/customerMethods'

export const editCustomer = protectedProcedure
  .input(editCustomerSchema)
  .mutation(async ({ input }) => {
    const updatedCustomer = await authenticatedTransaction(
      async ({ transaction }) => {
        return updateCustomer(input.customer, transaction)
      }
    )
    return {
      data: { customer: updatedCustomer },
    }
  })

```

And then in @/server/index.ts, you would add it to the appRouter like so:

```ts
// ... existing imports
import { editCustomer } from './mutations/editCustomer'

export const appRouter = router({
  // ... existing mutation
  editCustomer,
})
```

# Notes

- Import the necessary zod schema from the files in "@/db/schema/*"

- You should only need one zod schema. If it's not found, you should create one in the @/db/schema/<tableName.ts> file, and export it. The shape of the schema should be like so: { customer: customersUpdateSchema }

- The name of the mutation will specified in the prompt. Here's how the naming of the mutation relates to the ORM methods you would use:
    - editCustomer => updateCustomer
    - createCustomer => insertCustomer
    - deleteCustomer => deleteCustomer
We use "edit" instead of "update" to make it clear that this update may have side effects

- If you do need to make a new zod schema, adhere to the following guidelines:
  - Don't make a new zod object with individual properties. What you need should be available in the @/db/schema/<tableName.ts> file.
  - Name the schema like so: <edit|create|delete><TableName>Schema
  - Export both the schema and the inferred type from the db/schema/<tableName.ts> file:
  ```ts
  export const editCustomerSchema = z.object({
    customer: customersUpdateSchema
  })
  export type EditCustomerInput = z.infer<typeof editCustomerSchema>
  ```