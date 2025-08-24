# Using tableMethods modules

- Always pass the `transaction` object as the last argument when calling any method from this directory.
- Consume methods directly from the module exports; do not duplicate query logic in consumers.
- Ensure inputs are validated before calling; tableMethods assume inputs are already valid.
- All methods return type-safe data shaped to the database schema; consumers can rely on correct types.
- Methods follow naming conventions:
  - Use suffix `ById` for lookups filtering by a single id.
  - Use suffix `ByOrganizationWhere` when applying an organization-based `where` clause.

# Modifying tableMethods modules

- Any new or extended method must validate its output using Zod before returning. Reuse existing schemas or define new ones in a `schemas.ts` alongside the method.
- Give methods clear, descriptive names that reflect their filter or action. Examples:
  - `getUserById`
  - `updateSubscriptionByOrganizationWhere`
- Adhere to conventions in code style:
  - Define functions as arrow functions.
  - Import internal modules via `@/...` path aliases.
  - Reference foreign keys in PascalCase.
  - Place the `transaction` parameter at the end of the argument list when defining or calling methods.
- Write thorough tests for any method containing non-trivial logic or making guarantees implied by its name. Add tests in the corresponding `.test.ts` file.
