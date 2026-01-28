/* 
run the following in the terminal
bun tsx src/scripts/addFeatureFlags.ts organization_id=<ORG_ID> feature_flags=<'JSON GOES HERE'> overwrite=True(optional)

---WARNING---
Setting overwrite to true will completely overwrite the feature flags for the existing organization
with the given org_id

Also, if JSON key already exists in feature flags it will be overwritten no matter if
overwrite is toggled or not
*/

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { isNil } from 'ramda'
import {
  selectOrganizationById,
  updateOrganization,
} from '@/db/tableMethods/organizationMethods'
import runScript from './scriptRunner'

async function updateFeatureFlags(db: PostgresJsDatabase) {
  const args = process.argv.slice(2)

  const organizationIdArg = args
    .find((arg) => arg.startsWith('organization_id='))
    ?.split('=')[1]
  const featureFlagArg = args
    .find((arg) => arg.startsWith('feature_flags='))
    ?.split('=')[1]
  const overwriteArg = args
    .find((arg) => arg.startsWith('overwrite='))
    ?.split('=')[1]

  if (isNil(organizationIdArg) || isNil(featureFlagArg)) {
    throw new Error(
      'Either Organization ID is not given or feature flag is not given'
    )
  }

  let featureFlagArgObj = JSON.parse(featureFlagArg)

  await db.transaction(async (transaction) => {
    const org = (
      await selectOrganizationById(organizationIdArg, transaction)
    ).unwrap()

    if (overwriteArg?.toLowerCase() !== 'true') {
      featureFlagArgObj = {
        ...org.featureFlags,
        ...featureFlagArgObj,
      }
    }

    await updateOrganization(
      {
        id: organizationIdArg,
        featureFlags: featureFlagArgObj,
      },
      transaction
    )
  })
}

runScript(updateFeatureFlags)
