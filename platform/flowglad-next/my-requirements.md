Parse errors remain in:
  - adjustSubscription.db.test.ts (5 errors - some unclosed blocks)
  - updateTransaction.db.test.ts (20+ errors - transformation incomplete)

  Type errors exist in 76 files - These are non-test files (routers, mutations, queries) where:
  - Callbacks don't return Result.ok(value)
  - Missing .unwrap() calls on transaction results