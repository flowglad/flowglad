All of the following changes will happen in the directory `./platform/flowglad-next`, so when you see a path like `./src/db/schema/unicornRiders.ts`, it should be translated to `./packages/flowglad-next/src/db/schema/unicornRiders.ts`.

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
  } from '@/db/tableUtils'
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
          using: sql`"organization_id" in (select "organization_id" from "memberships" where "user_id" = requesting_user_id() union select current_organization_id() where current_auth_type() = 'api_key')`,
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
      import { enhancedCreateInsertSchema } from '@/db/tableUtils' // merge this with other imports from the same file
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

      export const unicornRidersUpdateSchema = createUpdateSchema(unicornRiders, columnRefinements)
      
      const createOnlyColumns = {
        email: true,
      }
      const readOnlyColumns = {
        organizationId: true,
      } as const

      const hiddenColumns = {
        superSecretColumn: true,
        createdByCommit: true, // always include
        updatedByCommit: true, // always include
      } as const
      
      const nonClientEditableColumns = {
        ...hiddenColumns,
        ...readOnlyColumns
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
    } from '@/db/tableUtils'
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
      tableName: 'unicorn_riders'
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
    ```

# Notes

- Import the necessary zod schema from the files in "@/db/schema/*"

- The name of the mutation will specified in the prompt. Here's how the naming of the mutation relates to the ORM methods you would use:
    - editUnicornRider => updateUnicornRider
    - createUnicornRider => insertUnicornRider
    - deleteUnicornRider => deleteUnicornRider
We use "edit" instead of "update" to make it clear that this update may have side effects

- If you do need to make a new zod schema, adhere to the following guidelines:
  - Don't make a new zod object with individual properties. What you need should be available in the @/db/schema/<tableName.ts> file.
  - Name the schema like so: <edit|create|delete><TableName>Schema
  - Export both the schema and the inferred type from the db/schema/<tableName.ts> file:
  ```ts
  export const editUnicornRiderSchema = z.object({
    unicornRider: unicornRidersUpdateSchema
  })
  export type EditUnicornRiderInput = z.infer<typeof editUnicornRiderSchema>
  ```

  - If the table is a union or discriminated union, you need to define the subtypes' inserts and selects separately, and then compose them with z.union() or z.discriminatedUnion() - AT THE VERB LEVEL, e.g.:
  ```
  const firstUnicornRiderInsertSchema = createEnhancedInsertSchema(firstUnicornRider).extend(columnRefinements)
  const firstUnicornRiderSelectSchema = createSelectSchema(firstUnicornRider).extend(columnRefinements)
  
  const secondUnicornRiderInsertSchema = createEnhancedInsertSchema(secondUnicornRider).extend(columnRefinements)
  const secondUnicornRiderSelectSchema = createSelectSchema(secondUnicornRider).extend(columnRefinements)
  
  const unicornRiderInsertSchema = z.union([firstUnicornRiderInsertSchema, secondUnicornRiderInsertSchema])
  const unicornRiderSelectSchema = z.union([firstUnicornRiderSelectSchema, secondUnicornRiderSelectSchema])
  ```

# Update testEnums.ts

After creating the new table schema, you must update the testEnums.ts script to test any enum columns in your new table. This ensures that all enum columns are properly validated against their expected values.

For each enum column in your new table, add a test call to the testEnums.ts script's transaction. Here's how to do it:

1. Open the file `./src/db/testEnums.ts`
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
