# Planning Test Cases
This is a guide designed to help you complete the second of three steps in writing a comprehensive test suite: writing the stubbed out code the test cases.

This is the middle step from taking the gameplan you developed in step 1, and implementing it in step 3. 

The idea here is that we will have a test file that has each of the test cases enumerated in describe / it / expect notation.
The goal is to have the test cases written out in bare minimum, stubbed form. The internal handler for each test case should have no code.
Instead it should just have comments describing:
1. What the setup should be, in steps
2. What the execptations should be, in some detail

The goal here is to create the pseudo code in comment form that will allow the agent in the third step to easily implement these tests given knowlege of the function and our own internal tooling for setting up test state.

## Example
Here's an example output. Note that absence of inner test code, but the comment format. This will be much easier for the agent to pick up in step 3.

```ts
import { describe, it, expect } from 'bun:test'

describe("categorizeUnicornRiders", () => {

   it("should order unicorn riders by status and then alphabetically, both in ascending order", () => {
    // setup:
    // - create 6 unicorn riders
    // - update the 3rd one's status to "retired"

    // expects:
    // all 3 unicorn riders returned
    // retired one is last
    // other 5 are first, sorted alphabetically
   })
   it("should return zero riders when the organization has none but other organizations have riders", () => {
    // setup:
    // - create "otherOrganization"
    // - create 6 unicorn riders for otherOrganization
    // - create no riders for main organization

    // expects
    // - function should return an empty array
   })
   // .... rest of test cases in this manner
})
```

## Notes
1. Absolutely under no circumstances should you ever stub or hard-code a foreignKey. Check the type definition + schema definition in @/db/schemas for a given type to see what keys are foreign keys. Same with ids. Just assume that we will be reading all records from the database. Don't confuse the next agent with this nonsense. They may set up the tests incorrectly. Instead, just say the records that you need and refer to them by name, rather than saying e.g. "result.usageMeterId should equal um_1" (when we know that ids from the database are randomly generated)

describe('processAddPaymentMethodSetupIntentSucceeded', () => {
   it('should automatically update all of a customers subscriptions to a new payment method when automaticallyUpdateSubscriptions is true', () => {
    // setup:
    // - create a customer with an old payment method
    // - create two subscriptions for the customer with the old payment method
    // - create a checkout session for adding a payment method, with automaticallyUpdateSubscriptions set to true
    // - create a setup intent that succeeded for this checkout session, with a new payment method

    // expects:
    // - the two subscriptions should have their defaultPaymentMethodId updated to the new payment method's id
   })
   it('should NOT automatically update all of a customers subscriptions to a new payment method when automaticallyUpdateSubscriptions is false', () => {
    // setup:
    // - create a customer with an old payment method
    // - create two subscriptions for the customer with the old payment method
    // - create a checkout session for adding a payment method, with automaticallyUpdateSubscriptions set to false
    // - create a setup intent that succeeded for this checkout session, with a new payment method

    // expects:
    // - the two subscriptions should NOT have their defaultPaymentMethodId updated to the new payment method's id
    // - they should retain their old payment method
   })
})
