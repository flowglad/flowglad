You are running a diagnostic process on the zod schemas of a database table in order to see why they are causing type errors in the associated tableMethods file in the codebase.

Let's say you're debugging the zod schemas of the `UnicornRiders` table.

The zod schemas are in the `src/db/schema/unicornRiders.ts` file.

The tableMethods file is in the `src/db/tableMethods/unicornRiderMethods.ts` file.

The type errors are in the `src/db/tableMethods/unicornRiderMethods.ts` file.

Usually what's happened is that the zod schema for a column has not been refined properly. Debugging this is usually a process of deduction.

Here are the things to check. Most commonly these problems are due to either enum or json columns.
For both:
  - ORM schema: should have a $type method applied to them so that they're not `unknown` types. Eg:
  ```ts
  // drizzle orm schema handed to pgTable():
  customerBillingAddress: jsonb('customerBillingAddress'),
  // rest of code ...

  const columnRefinement = {
    customerBillingAddress: billingAddressSchema
  }
  ```
  - columnRefinements: should have a specific object type declared for the JSON column

Other gotchas:
- Nullable columns should be refined with the .nullable() method in both drizzle orm schema and columnRefinements
- Date columns should use timestamp('columnName') - they should not have like { mode: 'date' }
- No columns should have a $type method applied to them - this tends to break our type inference, ironically.
- Mismatch where the db columns are declared nullable but the column refinements are not, and vice versa
- Oftentimes there's a problem with the way the zod schema are composed. Here's what you should see:
  - all insert schema should use `createEnhancedInsertSchema(unicornRiders).extend(columnRefinements)`
  - all select schema should use `createSelectSchema(unicornRiders).extend(columnRefinements)`
  - If the table is a union or discriminated union, you need to define the subtypes' inserts and selects separately, and then compose them with z.union() or z.discriminatedUnion() - AT THE VERB LEVEL, e.g.:
  ```
  const firstUnicornRiderInsertSchema = createEnhancedInsertSchema(firstUnicornRider).extend(columnRefinements)
  const firstUnicornRiderSelectSchema = createSelectSchema(firstUnicornRider).extend(columnRefinements)
  
  const secondUnicornRiderInsertSchema = createEnhancedInsertSchema(secondUnicornRider).extend(columnRefinements)
  const secondUnicornRiderSelectSchema = createSelectSchema(secondUnicornRider).extend(columnRefinements)
  
  const unicornRiderInsertSchema = z.union([firstUnicornRiderInsertSchema, secondUnicornRiderInsertSchema])
  const unicornRiderSelectSchema = z.union([firstUnicornRiderSelectSchema, secondUnicornRiderSelectSchema])
  ```
