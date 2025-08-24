## Conventions
1. When attempting any database access:
 1. Attempt to use the existing methods available in @/db/tableMethods/{{theTableYouNeedToAccess}}Methods.ts
 2. If the method does not exist, create it (see creating new db methods in the Claude.md file of that directory.)

## When Writing TRPC Code

1. Always specify mutation and query outputs using `.output()`
2. If possible, do not write raw ORM code in the procedures. It's pure tech debt. Instead, use db/tableMethods/fooMethods.ts where you can.
3. If you can't, parse the outputs using the appropriate zod schema.
4. Speaking of zod schema, always bias towards using the zod schema found in db/schema
