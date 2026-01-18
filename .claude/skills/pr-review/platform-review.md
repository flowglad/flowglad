# Platform (flowglad-next) Review Guidelines

Review guidelines for changes to `platform/flowglad-next/`, the main Flowglad application.

## Directory Structure

```
platform/flowglad-next/src/
├── app/                # Next.js App Router pages and API routes
├── components/         # React components
├── db/                 # Database layer
│   └── schema/         # Drizzle ORM schema definitions
├── server/             # Server-side business logic
├── utils/              # Utility functions
├── subscriptions/      # Subscription management logic
├── trigger/            # Trigger.dev background jobs
├── hooks/              # React hooks
├── contexts/           # React contexts
├── lib/                # Library integrations
├── email-templates/    # Email template components
├── pdf-generation/     # PDF generation utilities
├── api-contract/       # API contract definitions
├── test/               # Test utilities and helpers
└── types.ts            # Global type definitions
```

## Review Checklist

### API Routes (`app/api/`)
- [ ] Authentication/authorization checks present
- [ ] Input validation using Zod schemas
- [ ] Proper error handling with appropriate status codes
- [ ] Rate limiting considered for public endpoints
- [ ] No sensitive data in responses

### Database Operations
- [ ] Transactions used for multi-table operations
- [ ] RLS policies respected
- [ ] Indexes exist for query patterns
- [ ] No N+1 query patterns
- [ ] Proper error handling for constraint violations

### Business Logic (`server/`, `subscriptions/`)
- [ ] Edge cases handled
- [ ] State transitions are valid
- [ ] Audit logging where appropriate
- [ ] Billing calculations are precise (no floating point errors)
- [ ] Currency handling is consistent

### Background Jobs (`trigger/`)
- [ ] Jobs are idempotent
- [ ] Proper error handling and retries
- [ ] Timeouts configured appropriately
- [ ] Dead letter handling for failed jobs

### Components (`components/`)
- [ ] Client vs Server component usage is correct
- [ ] Loading and error states handled
- [ ] Accessibility considerations (aria labels, keyboard nav)
- [ ] No hardcoded text (use i18n if applicable)

## Testing Requirements

### Test Guidelines (from CLAUDE.md)
- No mocking except for network calls
- No `.spyOn` or dynamic imports
- No `any` types in tests
- Each `it` block should be specific and exhaustive
- Use detailed assertions, not `toBeDefined`

### Test Types
- **Unit tests**: Pure functions, utilities, business logic
- **Integration tests**: Database operations, API endpoints
- **Behavior tests**: Cross-implementation invariants (see `src/test/behaviorTest/`)

### RLS Tests
Schema files may have corresponding `.rls.test.ts` files testing row-level security policies.

## Security Considerations

### Authentication
- Better Auth integration for user sessions
- API key authentication for programmatic access
- Organization/membership boundaries

### Authorization
- Multi-tenant isolation via RLS
- Role-based access within organizations
- Resource ownership verification

### Data Protection
- Sensitive fields encrypted/hashed where appropriate
- PII handling compliant
- Audit logging for sensitive operations

## Integration Points

### External Services
- **Stripe**: Payment processing
- **Trigger.dev**: Background job execution
- **Email**: Transactional email sending
- **OpenTelemetry**: Observability

### Internal Systems
- **OpenAPI spec**: Generated from API routes
- **SDKs**: Packages consume the API
- **Documentation**: Describes the API and behaviors

## Performance Considerations

- [ ] Database queries are optimized
- [ ] Pagination for list endpoints
- [ ] Caching where appropriate
- [ ] Heavy operations offloaded to background jobs
- [ ] Bundle size impact for client components

## Common Patterns

### Error Handling
Use typed errors with better-result patterns where applicable.

### Validation
Zod schemas for all external input.

### Database Access
Drizzle ORM with typed queries.

### State Management
React contexts for client state, server state via React Query patterns.
