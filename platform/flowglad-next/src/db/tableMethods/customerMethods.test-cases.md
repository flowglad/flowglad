# Test Cases for `safelyMigrateOrphanedCustomersToDefaultPricingModel`

## Function Overview
The function `safelyMigrateOrphanedCustomersToDefaultPricingModel` migrates customers with null `pricingModelId` to the organization's default pricing model. It:
1. Retrieves the default pricing model for the given organization and livemode
2. Throws an error if no default pricing model exists
3. Updates all customers matching the criteria (organizationId, livemode, null pricingModelId) to use the default pricing model

## Test Cases

### Scenario 1: Successful Migration - Single Orphaned Customer

**Setup:**
- Create an organization
- Create a default pricing model for the organization (livemode: true)
- Create one customer with:
  - Matching organizationId
  - Matching livemode (true)
  - `pricingModelId` set to null

**Test:**
- Call `safelyMigrateOrphanedCustomersToDefaultPricingModel` with the organizationId and livemode

**Assertions:**
- The customer's `pricingModelId` is updated to the default pricing model's id
- No error is thrown
- The update query returns successfully

---

### Scenario 2: Successful Migration - Multiple Orphaned Customers

**Setup:**
- Create an organization
- Create a default pricing model for the organization (livemode: true)
- Create multiple customers (e.g., 3-5) with:
  - Matching organizationId
  - Matching livemode (true)
  - `pricingModelId` set to null

**Test:**
- Call `safelyMigrateOrphanedCustomersToDefaultPricingModel` with the organizationId and livemode

**Assertions:**
- All orphaned customers' `pricingModelId` values are updated to the default pricing model's id
- Customers that already have a `pricingModelId` are not affected
- No error is thrown

---

### Scenario 3: No Default Pricing Model Exists - Error Case

**Setup:**
- Create an organization
- Do NOT create a default pricing model for the organization
- Optionally create customers with null `pricingModelId`

**Test:**
- Call `safelyMigrateOrphanedCustomersToDefaultPricingModel` with the organizationId and livemode

**Assertions:**
- An error is thrown with message: `No default pricing model found for organization ${organizationId}`
- No customers are updated
- The error message includes the correct organizationId

---

### Scenario 4: No Orphaned Customers - No Updates Needed

**Setup:**
- Create an organization
- Create a default pricing model for the organization (livemode: true)
- Create customers with:
  - Matching organizationId
  - Matching livemode (true)
  - All customers already have a `pricingModelId` set (none are orphaned)

**Test:**
- Call `safelyMigrateOrphanedCustomersToDefaultPricingModel` with the organizationId and livemode

**Assertions:**
- No customers are updated (all already have pricingModelId)
- No error is thrown
- The function completes successfully

---

### Scenario 5: Mixed Customers - Only Orphaned Ones Updated

**Setup:**
- Create an organization
- Create a default pricing model for the organization (livemode: true)
- Create another pricing model (non-default) for the organization
- Create customers:
  - Some with null `pricingModelId` (orphaned)
  - Some with the non-default pricing model's id
  - Some with the default pricing model's id
  - All with matching organizationId and livemode (true)

**Test:**
- Call `safelyMigrateOrphanedCustomersToDefaultPricingModel` with the organizationId and livemode

**Assertions:**
- Only customers with null `pricingModelId` are updated to the default pricing model's id
- Customers that already have a `pricingModelId` (whether default or non-default) remain unchanged
- No error is thrown

---

### Scenario 6: Organization Isolation - Different Organization Not Affected

**Setup:**
- Create two organizations (org1 and org2)
- Create a default pricing model for org1 (livemode: true)
- Create customers:
  - Some in org1 with null `pricingModelId` (matching livemode: true)
  - Some in org2 with null `pricingModelId` (matching livemode: true)

**Test:**
- Call `safelyMigrateOrphanedCustomersToDefaultPricingModel` with org1's organizationId and livemode: true

**Assertions:**
- Only org1's orphaned customers are updated
- org2's customers remain unchanged (still have null `pricingModelId`)
- No error is thrown

---

### Scenario 7: Livemode Isolation - Different Livemode Not Affected

**Setup:**
- Create an organization
- Create a default pricing model for the organization (livemode: true)
- Create customers:
  - Some with livemode: true and null `pricingModelId`
  - Some with livemode: false and null `pricingModelId`
  - All with matching organizationId

**Test:**
- Call `safelyMigrateOrphanedCustomersToDefaultPricingModel` with the organizationId and livemode: true

**Assertions:**
- Only customers with livemode: true and null `pricingModelId` are updated
- Customers with livemode: false remain unchanged (still have null `pricingModelId`)
- No error is thrown

---

### Scenario 8: Test Mode (livemode: false) Migration

**Setup:**
- Create an organization
- Create a default pricing model for the organization (livemode: false)
- Create customers with:
  - Matching organizationId
  - Matching livemode (false)
  - `pricingModelId` set to null

**Test:**
- Call `safelyMigrateOrphanedCustomersToDefaultPricingModel` with the organizationId and livemode: false

**Assertions:**
- The customer's `pricingModelId` is updated to the default pricing model's id
- No error is thrown
- The function correctly handles test mode (livemode: false)

---

### Scenario 9: Combined Filters - All Conditions Must Match

**Setup:**
- Create an organization
- Create a default pricing model for the organization (livemode: true)
- Create customers with various combinations:
  - Correct organizationId, correct livemode (true), null `pricingModelId` (should be updated)
  - Correct organizationId, wrong livemode (false), null `pricingModelId` (should NOT be updated)
  - Wrong organizationId, correct livemode (true), null `pricingModelId` (should NOT be updated)
  - Correct organizationId, correct livemode (true), non-null `pricingModelId` (should NOT be updated)

**Test:**
- Call `safelyMigrateOrphanedCustomersToDefaultPricingModel` with the organizationId and livemode: true

**Assertions:**
- Only the customer matching ALL three conditions (organizationId, livemode: true, null pricingModelId) is updated
- All other customers remain unchanged
- No error is thrown

---

### Scenario 10: Empty Result Set - No Matching Customers

**Setup:**
- Create an organization
- Create a default pricing model for the organization (livemode: true)
- Create NO customers for this organization

**Test:**
- Call `safelyMigrateOrphanedCustomersToDefaultPricingModel` with the organizationId and livemode

**Assertions:**
- No error is thrown
- The function completes successfully
- The update query executes but affects zero rows
















