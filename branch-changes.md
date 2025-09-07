# Branch Changes Analysis

## Changes from main branch

| Category | Path & Line | Explanation |
|----------|-------------|-------------|
| Test Configuration | platform/flowglad-next/vitest.config.ts:16 | Added global testTimeout of 10000ms to handle integration tests |
| Test Fix | platform/flowglad-next/src/db/customerRLS.test.ts:468 | Added explicit 10000ms timeout to "should prevent customerA from seeing customerB data in same org" test |

## Summary of Changes
- Fixed test timeout issues by increasing the default timeout from 5000ms to 10000ms
- Applied fix both globally in vitest config and specifically to the failing test
- These changes ensure database integration tests have sufficient time to complete