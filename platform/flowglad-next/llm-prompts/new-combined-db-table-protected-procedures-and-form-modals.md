All of the following changes will happen in the directory `./platform/flowglad-next`, so when you see a path like `./src/db/schema/unicornRiders.ts`, it should be translated to `./packages/flowglad-next/src/db/schema/unicornRiders.ts`.

# 1. Create an ORM Schema
You're creating a new ORM schema for a Postgres database table, as well as all the associated types, queries and mutations.

You will rely heavily on the exported methods at ./src/db/tableUtils.ts to write your code.

Here's what you need to do, assuming the table is named "UnicornRiders" (the actual name will be provided to you by the prompt - "UnicornRiders" is just an example):
- Create a new file in the `./src/db/schema/unicornRiders.ts` directory. The file name should be the name of the table, in camelCase.
  - Use the `./src/db/schema/payments.ts` file as a reference pattern.
  - The name of the table should be declared as a global string constant, in PascalCase, (`const TABLE_NAME = 'UnicornRiders'`). And it should be used in the schema declaration as well as any constructor method invoked in the file where a table name is required.
  - All foreign keys referencing other tables must be PascalCase. Their types should match the column that they reference, of course.
  - All ORM schema declarations should use tableBase from tableUtils.
  - If the schema requires a new enum, declare and export that enum in src/types.ts, and then use that enum in the schema via pgEnumColumn.
  - Add pgPolicy to the schema to enable row level security. By default, the policy should be "permissive", and the "to" should be "authenticated". The "for" should be "all". And the policy can be:
  ```ts
  using: sql`"organization_id" in (select "organization_id" from "memberships" where "user_id" = requesting_user_id() union select current_organization_id() where current_auth_type() = 'api_key') // if there is a foreign key to a table that has an organizationId, you can use that instead
  ```
  - Here's a quick example of what the start of the file should look like, roughly:
  ```ts
  import { boolean, text, pgTable, pgPolicy } from 'drizzle-orm/pg-core'
  import { z } from 'zod'
  import { sql } from 'drizzle-orm'
  import {
    tableBase,
    notNullStringForeignKey,
    constructIndex,
    constructUniqueIndex,
    enhancedCreateInsertSchema,
    livemodePolicy,
  } from '@db-core/tableUtils'
  import { organizations } from '@/db/schema/organizations'
  import { createSelectSchema } from 'drizzle-zod'
  import { UnicornRiderStatus } from '@/types'

  const TABLE_NAME = 'unicorn_riders' // table name in db should be snake_case

  export const unicornRiders = pgTable(
    TABLE_NAME,
    {
      ...tableBase('unicorn_rider'),
      // columns should be camelCase in their typescript keys,
      // but snake_case in their db names
      organizationId: notNullStringForeignKey(
        'organization_id',
        organizations
      ),
      superSecretColumn: text('super_secret_column').notNull(),
      title: text('title').notNull(),
      active: boolean('active').notNull().default(true),
      status: pgEnumColumn({
        enumName: 'UnicornRiderStatus',
        columnName: 'status',
        enumBase: UnicornRiderStatus,
      }), // use the $type method to declare the type of enum columns so we're not dealing with string inferred types
      email: text('email').notNull().unique(),
    },
    (table) => {
      return [
        constructIndex(TABLE_NAME, [table.organizationId]),
        constructIndex(TABLE_NAME, [table.status]),
        constructUniqueIndex(TABLE_NAME, [table.email]),
        pgPolicy('Enable read for own organizations', {
          as: 'permissive',
          to: merchantRole,,
          for: 'all',
          using: sql`"organization_id"=current_organization_id()`,
        }),
        livemodePolicy(TABLE_NAME),
      ]
    }
  ).enableRLS()
  ```
  - If there are any foreign keys, use the (notNullish|nullable)(String|Integer)ForeignKey methods in tableUtils to declare them.
    - Table Indexes: these are declared via the second argument in pgTable which is a function that takes the table and returns an object with indexes.
      - If there are any foreign keys, make sure to make database indexes of them. Use constructIndex from tableUtils.
      - If there are any unique constraints, make database indexes of them. Use constructUniqueIndex from tableUtils.
      - If there are any enum columns, make database indexes of them
  - Export Zod Schema and types for: Insert, Select, Update, and Mutation Inputs
    - Delcare a columnRefinments object that has all of the zod schemas for each column that needs to be refined
    - You will need to make the following zod schema for each table. In the case that each table has unique subtypes (e.g. subscription prices and one-time prices), you will need to declare the subtypes accordingly:
      - columnRefinements (not a schema, but an object that contains the zod schema for each column that needs to be refined, to be used when creating the schema below)
      - insert schema
      - select schema
      - update schema
      - mutation input schema
      - client select schema
      - client insert schema
      - client update schema
      - XInsert
      - XUpdate
      - XRecord (the name for select returns)
      - XClientInsert
      - XClientUpdate
      - XClientRecord
    - Export unicornRidersInsertSchema and unicornRidersSelectSchema in the file, constructed via `createSelectSchema` from drizzle-zod and `enhancedCreateInsertSchema` from tableUtils.
    - Also export the update, as well as the createUnicornRiderInputSchema and editUnicornRiderInputSchema schemas:
      ```ts
      import { createSelectSchema } from 'drizzle-zod'
      import { enhancedCreateInsertSchema } from '@db-core/tableUtils' // merge this with other imports from the same file
      import core from '@/utils/core'
      // rest of the file...

      // declare a columnRefinements object that contains the zod schema for each column that needs to be refined.
      // the following column types should be refined:
      // - enums: use core.createSafeZodEnum
      // - positive integers: use core.safeZodPositiveInteger
      // - dates: use core.safeZodDate
      // All nullable columns should also have a .nullable() method applied to their schema in the refinements object.
      const columnRefinements = {
        status: core.createSafeZodEnum(UnicornRiderStatus),
      }
      /*
       * database schema
       */
      export const unicornRidersInsertSchema =
        enhancedCreateInsertSchema(unicornRiders, columnRefinements)

      export const unicornRidersSelectSchema =
        createSelectSchema(unicornRiders).extend(columnRefinements)

      export const unicornRidersUpdateSchema = createUpdateSchema(
        unicornRiders,
        columnRefinements
      )

      const createOnlyColumns = {
        email: true,
      }
      const readOnlyColumns = {
        livemode: true,
        organizationId: true,
      } as const

      const hiddenColumns = {
        superSecretColumn: true,
        createdByCommit: true,
        updateByCommit: true
      } as const
      
      const nonClientEditableColumns = {
        ...hiddenColumns,
        ...readOnlyColumns,
      } as const

      /*
       * client schemas
       */
      export const unicornRiderClientInsertSchema =
        unicornRidersInsertSchema.omit(nonClientEditableColumns)

      export const unicornRiderClientUpdateSchema =
        unicornRidersUpdateSchema.omit({...nonClientEditableColumns, ...createOnlyColumns})

      export const unicornRiderClientSelectSchema =
        unicornRidersSelectSchema.omit(hiddenColumns)

      export namespace UnicornRider {
        export type Insert = z.infer<typeof unicornRiderInsertSchema>
        export type Update = z.infer<typeof unicornRiderUpdateSchema>
        export type Record = z.infer<typeof unicornRiderSelectSchema>
        export type ClientInsert = z.infer<typeof unicornRiderClientInsertSchema>
        export type ClientUpdate = z.infer<typeof unicornRiderClientUpdateSchema>
        export type ClientRecord = z.infer<typeof unicornRiderClientSelectSchema>
      }

      export const createUnicornRiderInputSchema = z.object({
        unicornRider: unicornRiderClientInsertSchema
      })

      export type CreateUnicornRiderInput = z.infer<typeof createUnicornRiderInputSchema>
      
      export const editUnicornRiderInputSchema = z.object({
        unicornRider: unicornRiderClientUpdateSchema
      })
      export type EditUnicornRiderInput = z.infer<typeof editUnicornRiderInputSchema>
      // file continues...
      ```
    - The refine key for every integer column should be safeZodPositiveInteger, so that we can correctly parse inputs received as forms from the client
  - Export the following types (import { IdNumberParam } from '@/types'):
    - UnicornRiderInsert: z.infer<typeof unicornRidersInsertSchema>
    - UnicornRiderUpdate: z.infer<typeof unicornRidersUpdateSchema>
    - UnicornRiderRecord: z.infer<typeof unicornRidersSelectSchema>
- Create a new file at `./src/db/tableMethods/unicornRiderMethods.ts`. The file name should be the name of the table, in camelCase.
  - The file should export, at a minimum, the following functions:
    ```typescript
    import {
      createSelectById,
      createInsertFunction,
      createUpdateFunction,
      createSelectFunction,
      ORMMethodCreatorConfig,
    } from '@db-core/tableUtils'
    import {
      unicornRiders,
      unicornRidersInsertSchema,
      unicornRidersSelectSchema,
      unicornRidersUpdateSchema,
    } from '@/db/schema/unicornRiders'

    const config: ORMMethodCreatorConfig<
      typeof unicornRiders,
      typeof unicornRidersSelectSchema,
      typeof unicornRidersInsertSchema,
      typeof unicornRidersUpdateSchema
    > = {
      selectSchema: unicornRidersSelectSchema,
      insertSchema: unicornRidersInsertSchema,
      updateSchema: unicornRidersUpdateSchema,
    }

    export const selectUnicornRiderById = createSelectById(
      unicornRiders,
      config
    )

    export const insertUnicornRider = createInsertFunction(
      unicornRiders,
      config
    )

    export const updateUnicornRider = createUpdateFunction(
      unicornRiders,
      config
    )

    export const selectUnicornRiders = createSelectFunction(
      unicornRiders,
      config
    )
    ```
    - upsertUnicornRidersBy(.*) (where (.*) is the name of each uniqueness constraint, e.g. `upsertUnicornRiderByEmail`. For multi-column constraints, use "And" between column names, e.g. `upsertUnicornRiderByEmailAndPassword`, etc.). Below are examples of upserts on multiple and single column uniquness constraints respecitvely:
    ```typescript
    const upsertUnicornRiderByEmailAndPassword = createUpsertFunction(
      unicornRiders,
      [unicornRiders.email, unicornRiders.password],
      config
    )

    const upsertUnicornRiderById = createUpsertFunction(
      unicornRiders,
      unicornRiders.id,
      config
    )
    ```

Important note: if you have a jsonb column, you will need to apply .extend(columnRefinements) on the InsertSchema and SelectSchema to get the types for the column to flow through properly:
```
const columnRefinements = {
  // Add any jsonb column refinements here, for example:
  someJsonbColumn: z.object({
    foo: z.string(),
    bar: z.number()
  })
}

/*
 * database schema
 */
export const unicornRidersInsertSchema = enhancedCreateInsertSchema(
  unicornRiders,
  columnRefinements
).extend(columnRefinements)

export const unicornRidersSelectSchema = 
  createSelectSchema(unicornRiders).extend(columnRefinements)

export const unicornRidersUpdateSchema = createUpdateSchema(
  unicornRiders,
  columnRefinements
).extend(columnRefinements)

const readOnlyColumns = {
  livemode: true,
} as const

const hiddenColumns = {
  ...ommittedColumnsForInsertSchema,
} as const

const nonClientEditableColumns = {
  ...readOnlyColumns,
  organizationId: true,
} as const

/*
 * client schemas
 */
export const unicornRiderClientInsertSchema = unicornRidersInsertSchema.omit(
  nonClientEditableColumns
)

export const unicornRiderClientUpdateSchema = unicornRidersUpdateSchema.omit(
  nonClientEditableColumns
)

export const unicornRiderClientSelectSchema = 
  unicornRidersSelectSchema.omit(hiddenColumns)

export namespace UnicornRider {
  export type Insert = z.infer<typeof unicornRidersInsertSchema>
  export type Update = z.infer<typeof unicornRidersUpdateSchema>
  export type Record = z.infer<typeof unicornRidersSelectSchema>
  export type ClientInsert = z.infer<typeof unicornRiderClientInsertSchema>
  export type ClientUpdate = z.infer<typeof unicornRiderClientUpdateSchema>
  export type ClientRecord = z.infer<typeof unicornRiderClientSelectSchema>
}

export const createUnicornRiderInputSchema = z.object({
  unicornRider: unicornRiderClientInsertSchema,
})

export type CreateUnicornRiderInput = z.infer<
  typeof createUnicornRiderInputSchema
>

export const editUnicornRiderInputSchema = z.object({
  id: z.string(),
  unicornRider: unicornRiderClientUpdateSchema,
})

export type EditUnicornRiderInput = z.infer<typeof editUnicornRiderInputSchema>

```

# 2. Create new TRPC Router

Follow the following instructions for the trpc router. Refer to the TRPC docs for more information.

You can rely on the other protectedProcedures the directory @/server/routers for reference patterns.

```ts
import { router } from '../trpc'
import { editUnicornRiderInputSchema } from '@/db/schema/unicornRiders'
import {
  selectUnicornRiderById,
  updateUnicornRider,
} from '@/db/tableMethods/unicornRiderMethods'
import { generateOpenApiMetas } from '@/utils/openapi'
import {
  createUnicornRiderInputSchema,
  unicornRidersClientSelectSchema,
  unicornRidersPaginatedSelectSchema,
  unicornRidersPaginatedListSchema,
} from '@/db/schema/unicornRiders'

import { protectedProcedure } from '@/server/trpc'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import {
  insertUnicornRider,
  selectUnicornRidersPaginated,
} from '@/db/tableMethods/unicornRiderMethods'
import { idInputSchema } from '@db-core/tableUtils'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { z } from 'zod'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'unicornRider',
  tags: ['UnicornRiders'],
})

export const unicornRidersRouteConfigs = routeConfigs

export const createUnicornRider = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createUnicornRiderInputSchema)
  .output(z.object({ unicornRider: unicornRiderClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(async ({ input, transaction, userId, livemode }) => {
      const [{ organization }] = await selectMembershipAndOrganizations(
        {
          userId,
          focused: true,
        },
        transaction
      )
      const unicornRider = await insertUnicornRider(
        {
          ...input.unicornRider,
          organizationId: organization.id,
          livemode,
        },
        transaction
      )
      return { unicornRider }
    })
  )

const listUnicornRidersProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(unicornRidersPaginatedSelectSchema)
  .output(unicornRidersPaginatedListSchema)
  .query(
    authenticatedProcedureTransaction(async ({ input, transaction }) => {
      return selectUnicornRidersPaginated(input, transaction)
    })
  )

export const editUnicornRider = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editUnicornRiderInputSchema)
  .output(z.object({ unicornRider: unicornRiderClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(async ({ input, transaction }) => {
      const unicornRider = await updateUnicornRider(
        {
          ...input.unicornRider,
          id: input.id,
        },
        transaction
      )
      return { unicornRider }
    })
  )

export const getUnicornRider = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ unicornRider: unicornRiderClientSelectSchema }))
  .query(
    authenticatedProcedureTransaction(async ({ input, transaction }) => {
      const unicornRider = await selectUnicornRiderById(input.id, transaction)
      return { unicornRider }
    })
  )

export const unicornRidersRouter = router({
  get: getUnicornRider,
  create: createUnicornRider,
  update: editUnicornRider,
  list: listUnicornRidersProcedure,
})
```

And then in @/server/index.ts, you would add it to the appRouter like so:

```ts
// ... existing imports
import { unicornRidersRouter } from './routers/unicornRidersRouter'

export const appRouter = router({
  // ... existing routers...
  unicornRiders: unicornRidersRouter,
})
```

## Notes

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

# 3. Create Form Modals
- In @/components/forms, create a new file UnicornRiderFormFields.tsx, and stub it out like so:
```tsx
'use client'

'use client'

import { useFormContext, Controller } from 'react-hook-form'
import { CreateUnicornRiderInput } from '@/db/schema/unicornRiders'
import { RadioGroup, RadioGroupItem } from '@/components/ion/Radio'
import Input from '@/components/ion/Input'
import { UnicornRiderType } from '@/types'

const UnicornRiderFormFields = () => {
  const {
    register,
    formState: { errors },
    control,
  } = useFormContext<CreateUnicornRiderInput>()
  return (
    <div className="flex flex-col gap-4">
      <Input
        {...register('unicornRider.name')}
        label="Name"
        placeholder="e.g. Rider Name"
        error={errors.apiKey?.name?.message}
      />
      <Controller
        control={control}
        name="unicornRider.type"
        render={({ field }) => (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground">Type</p>
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value={UnicornRiderType.Secret}
                  label="Secret"
                  id="secret"
                />
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value={UnicornRiderType.Publishable}
                  label="Publishable"
                  id="publishable"
                />
              </div>
            </RadioGroup>
          </div>
        )}
      />
    </div>
  )
}

export default UnicornRiderFormFields
```

Using '@/components/forms/FormModal', create new form modals for the newly created table:
- @/components/components/CreateUnicornRiderModal
- @/components/components/EditUnicornRiderModal

They should follow the following pattern:
```ts
// in @/components/forms/EditUnicornRiderModal.tsx
'use client'

import FormModal from '@/components/forms/FormModal'
import {
  UnicornRider,
  editUnicornRiderSchema,
} from '@/db/schema/unicornRiders'
import UnicornRiderFormFields from '@/components/forms/UnicornRiderFormFields'
import { trpc } from '@/app/_trpc/client'

interface EditUnicornRiderModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  // omit for CreateUnicornRiderModal
  unicornRider: UnicornRider.ClientRecord
}

const EditUnicornRiderModal: React.FC<EditUnicornRiderModalProps> = ({
  isOpen,
  setIsOpen,
  unicornRider,
}) => {
  const editUnicornRider = trpc.editUnicornRider.useMutation()
  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Unicorn Rider"
      formSchema={editUnicornRiderSchema}
      defaultValues={{ unicornRider }}
      onSubmit={editUnicornRider.mutateAsync}
    >
      <UnicornRiderFormFields />
    </FormModal>
  )
}

export default EditUnicornRiderModal
```

# 4. Update testDatabaseEnums.ts Script

After creating the new table schema, you must update the testDatabaseEnums.ts script to test any enum columns in your new table. This ensures that all enum columns are properly validated against their expected values.

For each enum column in your new table, add a test call to the testDatabaseEnums.ts script's transaction. Here's how to do it:

1. Open the file `./src/scripts/testDatabaseEnums.ts`
2. Import your new table and any enum types you've created:
   ```typescript
   import { unicornRiders } from '@/db/schema/unicornRiders'
   import { UnicornRiderStatus } from '@/types'
   ```
3. Add a test call for each enum column in your table within the transaction block:
   ```typescript
   // UnicornRiders table
   await testEnumColumn(
     unicornRiders,
     unicornRiders.status,
     UnicornRiderStatus,
     tx
   )
   ```

Make sure to add these test calls for all enum columns in your new table. This ensures that the enum values in your database match the expected values defined in your TypeScript code.
