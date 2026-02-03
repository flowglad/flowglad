# Error Handling Documentation

This document describes the comprehensive error handling system implemented across the Flowglad application.

## Overview

The error handling system consists of three layers:
1. **Database Layer** - Enhanced error catching in `tableUtils.ts`
2. **PostgreSQL Parser** - Constraint and error code mapping in `postgresErrorParser.ts`
3. **TRPC Layer** - User-friendly error transformation in `trpcErrorHandler.ts`

## Architecture

```
Database Operation
    ↓
tableUtils.ts (try/catch with context)
    ↓
PostgreSQL Error
    ↓
postgresErrorParser.ts (constraint mapping)
    ↓
trpcErrorHandler.ts (user-friendly messages)
    ↓
Client receives actionable error
```

## Database Layer (`tableUtils.ts`)

All database operations are wrapped with try/catch blocks that:
- Preserve the original error via the `cause` property
- Add contextual information (table name, operation, ID)
- Log detailed errors for debugging

Example:
```typescript
} catch (error) {
  console.error(`[createUpdateFunction] Error updating ${config.tableName} with id ${update.id}:`, error)
  throw new Error(
    `Failed to update ${config.tableName} with id ${update.id}: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error }
  )
}
```

## PostgreSQL Error Parser (`postgresErrorParser.ts`)

### Features

1. **Comprehensive Constraint Mapping**: 200+ specific constraint messages for all tables
2. **RLS (Row-Level Security) Handling**: Opaque user messages with detailed internal logging
3. **PostgreSQL Error Codes**: Full mapping of standard error codes
4. **Resource-Specific Context**: Helpful tips based on the affected resource

### Constraint Types Handled

- **Unique Constraints**: Duplicate key violations with specific field guidance
- **Foreign Key Constraints**: References to non-existent data
- **Check Constraints**: Data validation failures
- **Not Null Constraints**: Missing required fields
- **RLS Policies**: Permission and access control violations

### RLS Error Handling

RLS errors are handled specially to maintain security:
- **User sees**: "You don't have permission to perform this action"
- **Logs contain**: Full policy name, operation, and table details

Example RLS patterns detected:
```typescript
const RLS_ERROR_PATTERNS = [
  /new row violates row-level security policy "([^"]+)" for table "([^"]+)"/,
  /permission denied for table ([^\s]+)/,
  // ... more patterns
]
```

## TRPC Error Handler (`trpcErrorHandler.ts`)

### Key Functions

1. **`extractErrorDetails`**: Extracts and categorizes error information
2. **`handleTRPCError`**: Main error handler that throws formatted TRPC errors
3. **`errorHandlers`**: Pre-configured handlers for each resource type

### Error Code Mapping

PostgreSQL codes are mapped to TRPC codes:
- `23505` (unique violation) → `CONFLICT`
- `23503` (foreign key) → `BAD_REQUEST`
- `42501` (permission denied) → `FORBIDDEN`
- `42P01` (table not found) → `NOT_FOUND`

## Implementation in Routers

Routers use the error handlers to provide consistent error handling:

```typescript
try {
  const updatedProduct = await updateProduct(input.product, transaction)
  return { product: updatedProduct }
} catch (error) {
  errorHandlers.product.handle(error, {
    operation: 'update',
    id: input.product.id,
    details: { productData: input.product }
  })
}
```

## Examples of User-Friendly Messages

### Before
```
Failed query: update "products" set "slug" = $1, "updated_at" = $2 where "products"."id" = $3 
returning "id", "pricing_model_id", "external_id", "slug"...
```

### After
```
This product slug already exists in this pricing model. Please choose a different slug.
```

### More Examples

| Error Type | User Message |
|------------|--------------|
| Duplicate email | "This email address is already registered. Please use a different email or log in to your existing account." |
| Invalid subscription status | "Invalid subscription status transition. Active subscriptions can only be canceled or paused." |
| Missing customer | "Cannot create subscription: The specified customer does not exist. Please create the customer first." |
| RLS violation | "You don't have permission to perform this action. Please contact your administrator if you believe this is an error." |

## Global Error Formatter

The TRPC core object includes a global error formatter in `coreTrpcObject.ts`:

```typescript
errorFormatter: ({ shape, error }) => {
  const errorDetails = extractErrorDetails(error)
  return {
    ...shape,
    data: {
      ...shape.data,
      userMessage: errorDetails.userMessage,
      developerMessage: errorDetails.developerMessage,
      errorContext: errorDetails.context
    }
  }
}
```

## Testing Error Handling

To test the error handling:

1. **Unique Constraint**: Try creating a product with a duplicate slug
2. **Foreign Key**: Reference a non-existent pricing_model_id
3. **RLS Error**: Attempt to access data from another organization
4. **Check Constraint**: Set an invalid status value

## Adding New Error Mappings

When adding new database constraints:

1. Add the constraint name to `CONSTRAINT_MESSAGES` in `postgresErrorParser.ts`
2. Provide a user-friendly message
3. If it's a complex constraint, add a `ConstraintMapping` object with field-specific messages
4. Test the error message by triggering the constraint violation

## Monitoring and Debugging

All errors are logged with:
- Original error details
- User-friendly message shown
- Operation context
- Timestamp
- Stack trace (in development)

Check console logs for `[TRPC Error Handler]` and `[PostgreSQL Error]` prefixes to debug issues.

## Security Considerations

1. **Never expose internal details**: Table names, column names, or query structure should not appear in user messages
2. **RLS errors are opaque**: Users should not know which specific policy they violated
3. **Log sensitive operations**: All permission-related errors should be logged for audit purposes
4. **Rate limiting**: Consider implementing rate limiting for operations that frequently trigger errors