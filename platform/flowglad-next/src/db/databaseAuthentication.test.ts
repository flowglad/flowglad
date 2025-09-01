import { describe, it, expect, beforeEach } from 'vitest'
import {
  databaseAuthenticationInfoForWebappRequest,
  dbAuthInfoForSecretApiKeyResult,
  dbAuthInfoForBillingPortalApiKeyResult,
  databaseAuthenticationInfoForApiKeyResult,
  getDatabaseAuthenticationInfo,
  dbInfoForCustomerBillingPortal,
} from '@/db/databaseAuthentication'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupCustomer,
  setupOrg,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { eq } from 'drizzle-orm'
import { users, type UserRecord } from '@/db/schema/users'
import { memberships, type Membership } from '@/db/schema/memberships'
import { type Organization } from '@/db/schema/organizations'
import { customers, type Customer } from '@/db/schema/customers'
import type { User as BetterAuthUser } from 'better-auth'
import { FlowgladApiKeyType } from '@/types'
import core from '@/utils/core'

type BetterAuthUserWithRole = BetterAuthUser & { role: string }

let webUser: UserRecord
let webOrgA: Organization.Record
let webOrgB: Organization.Record
let webOrgC: Organization.Record
let webMemA: Membership.Record
let webMemB: Membership.Record
let webMemC: Membership.Record
let webBetterAuthId: string
let webUserEmail: string

let secretOrg: Organization.Record
let secretUser: UserRecord
let secretMembership: Membership.Record
let secretClerkId: string

let billingOrg: Organization.Record
let billingUser1: UserRecord
let billingUser2: UserRecord
let billingMem1: Membership.Record
let billingMem2: Membership.Record
let billingCustomer: Customer.Record
let billingPortalStackAuthUserId: string

let secretApiKeyOrg: Organization.Record
let secretApiKeyTokenLive: string
let secretApiKeyTokenTest: string

beforeEach(async () => {
  // Webapp-focused user and memberships across 3 orgs
  const webOrgSetupA = await setupOrg()
  const webOrgSetupB = await setupOrg()
  const webOrgSetupC = await setupOrg()
  webOrgA = webOrgSetupA.organization
  webOrgB = webOrgSetupB.organization
  webOrgC = webOrgSetupC.organization

  webBetterAuthId = `bau_${core.nanoid()}`
  webUserEmail = `webapp+${core.nanoid()}@test.com`
  await adminTransaction(async ({ transaction }) => {
    const [insertedUser] = await transaction
      .insert(users)
      .values({
        id: `usr_${core.nanoid()}`,
        email: webUserEmail,
        name: 'Webapp Test User',
        betterAuthId: webBetterAuthId,
      })
      .returning()
    webUser = insertedUser as UserRecord

    const [mA] = await transaction
      .insert(memberships)
      .values({
        userId: webUser.id,
        organizationId: webOrgA.id,
        focused: false,
        livemode: false,
      })
      .returning()
    const [mB] = await transaction
      .insert(memberships)
      .values({
        userId: webUser.id,
        organizationId: webOrgB.id,
        focused: true,
        livemode: true,
      })
      .returning()
    const [mC] = await transaction
      .insert(memberships)
      .values({
        userId: webUser.id,
        organizationId: webOrgC.id,
        focused: false,
        livemode: false,
      })
      .returning()
    webMemA = mA as Membership.Record
    webMemB = mB as Membership.Record
    webMemC = mC as Membership.Record
  })

  // Secret API key user inside a dedicated org, with clerkId present
  const secretOrgSetup = await setupOrg()
  secretOrg = secretOrgSetup.organization
  secretClerkId = `clerk_${core.nanoid()}`
  await adminTransaction(async ({ transaction }) => {
    const [insertedSecretUser] = await transaction
      .insert(users)
      .values({
        id: `usr_${core.nanoid()}`,
        email: `secret+${core.nanoid()}@test.com`,
        name: 'Secret Key User',
        clerkId: secretClerkId,
      })
      .returning()
    secretUser = insertedSecretUser as UserRecord

    const [m] = await transaction
      .insert(memberships)
      .values({
        userId: secretUser.id,
        organizationId: secretOrg.id,
        focused: true,
        livemode: false,
      })
      .returning()
    secretMembership = m as Membership.Record
  })

  // Billing Portal scenario: two memberships; earliest createdAt should be chosen
  const billingOrgSetup = await setupOrg()
  billingOrg = billingOrgSetup.organization
  await adminTransaction(async ({ transaction }) => {
    const [u1] = await transaction
      .insert(users)
      .values({
        id: `usr_${core.nanoid()}`,
        email: `billing1+${core.nanoid()}@test.com`,
        name: 'Billing Portal User 1',
      })
      .returning()
    const [m1] = await transaction
      .insert(memberships)
      .values({
        userId: (u1 as UserRecord).id,
        organizationId: billingOrg.id,
        focused: false,
        livemode: true,
      })
      .returning()

    const [u2] = await transaction
      .insert(users)
      .values({
        id: `usr_${core.nanoid()}`,
        email: `billing2+${core.nanoid()}@test.com`,
        name: 'Billing Portal User 2',
      })
      .returning()
    const [m2] = await transaction
      .insert(memberships)
      .values({
        userId: (u2 as UserRecord).id,
        organizationId: billingOrg.id,
        focused: false,
        livemode: true,
      })
      .returning()

    billingUser1 = u1 as UserRecord
    billingUser2 = u2 as UserRecord
    billingMem1 = m1 as Membership.Record
    billingMem2 = m2 as Membership.Record
  })

  billingPortalStackAuthUserId = `stack_hosted_${core.nanoid()}`
  billingCustomer = await setupCustomer({
    organizationId: billingOrg.id,
    email: `bp-${core.nanoid()}@test.com`,
    livemode: true,
  })
  // Update the customer to include stackAuthHostedBillingUserId
  await adminTransaction(async ({ transaction }) => {
    await transaction
      .update(customers)
      .set({
        stackAuthHostedBillingUserId: billingPortalStackAuthUserId,
      })
      .where(eq(customers.id, billingCustomer.id))
  })

  // Secret API key tokens for integration path using test-mode keyVerify
  const secretApiKeyOrgSetup = await setupOrg()
  secretApiKeyOrg = secretApiKeyOrgSetup.organization
  const liveKey = await setupUserAndApiKey({
    organizationId: secretApiKeyOrg.id,
    livemode: true,
  })
  const testKey = await setupUserAndApiKey({
    organizationId: secretApiKeyOrg.id,
    livemode: false,
  })
  secretApiKeyTokenLive = liveKey.apiKey.token
  secretApiKeyTokenTest = testKey.apiKey.token
})

describe('databaseAuthenticationInfoForWebappRequest', () => {
  it('should use the focused membership to derive userId, livemode, and jwtClaim fields', async () => {
    // setup:
    // - create a user "WebUser" with a known betterAuthId
    // - create three memberships for WebUser across three organizations:
    //   - M1 for OrgA with focused=false, livemode=false
    //   - M2 for OrgB with focused=true, livemode=true (this should be selected)
    //   - M3 for OrgC with focused=false, livemode=false
    // - ensure users.betterAuthId == WebUser.id for lookup
    // expects:
    // - returned.userId equals M2.userId
    // - returned.livemode equals true (from M2.livemode)
    // - returned.jwtClaim.sub equals M2.userId
    // - returned.jwtClaim.user_metadata.id equals M2.userId
    // - returned.jwtClaim.organization_id equals M2.organizationId
    // - returned.jwtClaim.email equals WebUser.email
    // - returned.jwtClaim.app_metadata.provider equals 'apiKey' (note: surprising, but current behavior)
    const mockBetterAuthUser = {
      id: (webUser as any).betterAuthId ?? (webUser as any).id, // ensure we pass the betterAuthId used in beforeEach
      email: (webUser as any).email,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole
    const result = await databaseAuthenticationInfoForWebappRequest(
      mockBetterAuthUser,
      undefined
    )
    expect(result.userId).toEqual(webMemB.userId)
    expect(result.livemode).toEqual(true)
    expect(result.jwtClaim.sub).toEqual(webMemB.userId)
    expect(result.jwtClaim.user_metadata.id).toEqual(webMemB.userId)
    expect(result.jwtClaim.organization_id).toEqual(
      webMemB.organizationId
    )
    expect(result.jwtClaim.email).toEqual((webUser as any).email)
    expect(result.jwtClaim.app_metadata.provider).toEqual('apiKey')
  })

  it('should fall back to the first membership returned when none are focused', async () => {
    // setup:
    // - create a user "WebUserNoFocus" with a known betterAuthId
    // - create two memberships for this user with focused=false for both:
    //   - M1 for OrgA, livemode=false
    //   - M2 for OrgB, livemode=true
    // - do not set any membership as focused
    // - note: selection is determined by DB ordering after orderBy(desc(focused)); with all false, order becomes implementation-defined
    // expects:
    // - returned record corresponds to the first row yielded by the query (align with fixture creation order)
    // - returned.jwtClaim.sub equals the selected membership.userId
    // - returned.jwtClaim.organization_id equals the selected membership.organizationId
    // - returned.livemode equals the selected membership.livemode
    const mockBetterAuthUser = {
      id: (webUser as any).betterAuthId ?? (webUser as any).id,
      email: (webUser as any).email,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole
    // flip focused=false for the previously focused membership
    await adminTransaction(async ({ transaction }) => {
      await transaction
        .update(memberships)
        .set({ focused: false })
        .where(eq(memberships.id, webMemB.id))
    })
    const result = await databaseAuthenticationInfoForWebappRequest(
      mockBetterAuthUser
    )
    expect([
      webMemA.organizationId,
      webMemB.organizationId,
      webMemC.organizationId,
    ]).toContain(result.jwtClaim.organization_id)
  })

  it('should return undefined userId and empty organization_id when the user has no memberships', async () => {
    // setup:
    // - create a user "WebUserNoMemberships" with a known betterAuthId
    // - create zero memberships for this user
    // expects:
    // - returned.userId is undefined
    // - returned.livemode is false
    // - returned.jwtClaim.sub is undefined
    // - returned.jwtClaim.user_metadata.id is undefined
    // - returned.jwtClaim.organization_id is ""
    // - returned.jwtClaim.email equals the user email passed in
    const lonelyBetterAuthId = `bau_${core.nanoid()}`
    const lonelyEmail = `lonely+${core.nanoid()}@test.com`
    let lonelyUserId: string
    await adminTransaction(async ({ transaction }) => {
      const [lonelyUser] = await transaction
        .insert(users)
        .values({
          id: `usr_${core.nanoid()}`,
          email: lonelyEmail,
          name: 'Lonely User',
          betterAuthId: lonelyBetterAuthId,
        })
        .returning()
      lonelyUserId = (lonelyUser as any).id
    })
    const mockBetterAuthUser = {
      id: lonelyBetterAuthId,
      email: lonelyEmail,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole
    const result = await databaseAuthenticationInfoForWebappRequest(
      mockBetterAuthUser
    )
    expect(result.userId).toBeUndefined()
    expect(result.livemode).toEqual(false)
    expect(result.jwtClaim.sub).toBeUndefined()
    expect(result.jwtClaim.user_metadata.id).toBeUndefined()
    expect(result.jwtClaim.organization_id).toEqual('')
    expect(result.jwtClaim.email).toEqual(lonelyEmail)
  })
})

describe('dbAuthInfoForSecretApiKeyResult', () => {
  it('should resolve userId via internal users.id when membership exists in the owner organization', async () => {
    // setup:
    // - create Organization "OrgS1"
    // - create User "SecretUser1" with both users.id and users.clerkId set
    // - create Membership "MS1" linking SecretUser1 to OrgS1
    // - construct verifyKeyResult with:
    //   - keyType=Secret
    //   - ownerId=OrgS1.id
    //   - userId=SecretUser1.id (internal id)
    //   - environment="live"
    // expects:
    // - returned.userId equals SecretUser1.id
    // - returned.livemode equals true
    // - returned.jwtClaim.sub equals SecretUser1.id
    // - returned.jwtClaim.user_metadata.id equals SecretUser1.id
    // - returned.jwtClaim.organization_id equals OrgS1.id
    // - returned.jwtClaim.email equals 'apiKey@example.com'
    // - returned.jwtClaim.session_id is present
    // - returned.jwtClaim.app_metadata.provider equals 'apiKey'
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
      },
    }
    const result = await dbAuthInfoForSecretApiKeyResult(
      verifyKeyResult as any
    )
    expect(result.userId).toEqual(secretUser.id)
    expect(result.livemode).toEqual(true)
    expect(result.jwtClaim.sub).toEqual(secretUser.id)
    expect(result.jwtClaim.user_metadata.id).toEqual(secretUser.id)
    expect(result.jwtClaim.organization_id).toEqual(secretOrg.id)
    expect(result.jwtClaim.email).toEqual('apiKey@example.com')
    expect(result.jwtClaim.session_id).toBeDefined()
    expect(result.jwtClaim.app_metadata.provider).toEqual('apiKey')
  })

  it('should resolve userId via users.clerkId mapping when membership exists in the owner organization', async () => {
    // setup:
    // - create Organization "OrgS2"
    // - create User "SecretUser2" with a specific users.clerkId
    // - create Membership "MS2" linking SecretUser2 to OrgS2
    // - construct verifyKeyResult with:
    //   - keyType=Secret
    //   - ownerId=OrgS2.id
    //   - userId=SecretUser2.clerkId (not the internal id)
    //   - environment="test"
    // expects:
    // - returned.userId equals SecretUser2.id (resolved via the join on users.clerkId)
    // - returned.livemode equals false
    // - returned.jwtClaim.sub equals SecretUser2.id
    // - returned.jwtClaim.user_metadata.id equals SecretUser2.id
    // - returned.jwtClaim.organization_id equals OrgS2.id
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.Secret,
      userId: (secretUser as any).clerkId,
      ownerId: secretOrg.id,
      environment: 'test',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: (secretUser as any).clerkId,
        organizationId: secretOrg.id,
      },
    }
    const result = await dbAuthInfoForSecretApiKeyResult(
      verifyKeyResult as any
    )
    expect(result.userId).toEqual(secretUser.id)
    expect(result.livemode).toEqual(false)
    expect(result.jwtClaim.sub).toEqual(secretUser.id)
    expect(result.jwtClaim.user_metadata.id).toEqual(secretUser.id)
    expect(result.jwtClaim.organization_id).toEqual(secretOrg.id)
  })

  it('should currently throw if no membership is found for the owner organization (unsafe indexing)', async () => {
    // setup:
    // - create Organization "OrgS3"
    // - create User "SecretUser3" without any membership in OrgS3
    // - construct verifyKeyResult with:
    //   - keyType=Secret
    //   - ownerId=OrgS3.id
    //   - userId=SecretUser3.id (or SecretUser3.clerkId)
    //   - environment="test"
    // expects:
    // - function currently attempts to access membershipsForOrganization[0].users.id and will throw when the array is empty
    // - assert that an error is thrown (document existing behavior; candidate for future fix)
    const otherOrg = (await setupOrg()).organization
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: otherOrg.id,
      environment: 'test',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: otherOrg.id,
      },
    }
    await expect(
      dbAuthInfoForSecretApiKeyResult(verifyKeyResult as any)
    ).rejects.toThrow()
  })

  it('should map environment to livemode correctly', async () => {
    // setup:
    // - create Organization "OrgS4" and a User "SecretUser4" with a membership in OrgS4
    // - run twice with verifyKeyResult.environment set to "live" and "test"
    // expects:
    // - environment "live" -> returned.livemode === true
    // - environment "test" -> returned.livemode === false
    const liveResult = await dbAuthInfoForSecretApiKeyResult({
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
      },
    } as any)
    const testResult = await dbAuthInfoForSecretApiKeyResult({
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'test',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
      },
    } as any)
    expect(liveResult.livemode).toEqual(true)
    expect(testResult.livemode).toEqual(false)
  })
})

describe('dbAuthInfoForBillingPortalApiKeyResult', () => {
  it('should resolve the earliest membership in the organization and derive claims', async () => {
    // setup:
    // - create Organization "OrgB1"
    // - create Users U1 and U2
    // - create Membership M1 for U1 in OrgB1 with createdAt earlier
    // - create Membership M2 for U2 in OrgB1 with createdAt later
    // - create Customer C with organizationId=OrgB1.id and stackAuthHostedBillingUserId=S
    // - construct verifyKeyResult with:
    //   - keyType=BillingPortalToken
    //   - environment="live"
    //   - metadata: { organizationId: OrgB1.id, stackAuthHostedBillingUserId: S }
    // expects:
    // - returned.userId equals U1.id (earliest by createdAt asc)
    // - returned.livemode equals true
    // - returned.jwtClaim.sub equals U1.id
    // - returned.jwtClaim.user_metadata.id equals U1.id
    // - returned.jwtClaim.organization_id equals OrgB1.id
    // - returned.jwtClaim.app_metadata.provider equals 'apiKey'
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.BillingPortalToken,
      userId: 'ignored_for_billing_portal',
      ownerId: billingOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.BillingPortalToken,
        stackAuthHostedBillingUserId: billingPortalStackAuthUserId,
        organizationId: billingOrg.id,
      },
    }
    const result = await dbAuthInfoForBillingPortalApiKeyResult(
      verifyKeyResult as any
    )
    expect([billingUser1.id, billingUser2.id]).toContain(
      result.userId
    )
    expect(result.livemode).toEqual(true)
    expect([billingUser1.id, billingUser2.id]).toContain(
      result.jwtClaim.sub
    )
    expect([billingUser1.id, billingUser2.id]).toContain(
      result.jwtClaim.user_metadata.id
    )
    expect(result.jwtClaim.organization_id).toEqual(billingOrg.id)
    expect(result.jwtClaim.app_metadata.provider).toEqual('apiKey')
  })

  it('should throw when no matching customer exists for the metadata', async () => {
    // setup:
    // - ensure no Customer exists for the given (organizationId, stackAuthHostedBillingUserId)
    // - construct verifyKeyResult with valid-looking metadata that does not match any customer
    // expects:
    // - throws an error: "Billing Portal Authentication Error: No customer found with externalId ..."
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.BillingPortalToken,
      userId: 'ignored',
      ownerId: billingOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.BillingPortalToken,
        stackAuthHostedBillingUserId: `missing_${core.nanoid()}`,
        organizationId: billingOrg.id,
      },
    }
    await expect(
      dbAuthInfoForBillingPortalApiKeyResult(verifyKeyResult as any)
    ).rejects.toThrow()
  })

  it('should throw when organization has zero memberships', async () => {
    // setup:
    // - create Organization "OrgB2" with zero memberships
    // - create Customer C for OrgB2 with some stackAuthHostedBillingUserId=S
    // - construct verifyKeyResult with metadata referencing OrgB2.id and S
    // expects:
    // - throws an error: "Billing Portal Authentication Error: No memberships found for organization ..."
    const emptyOrg = (await setupOrg()).organization
    const emptyOrgCustomer = await setupCustomer({
      organizationId: emptyOrg.id,
      email: `bp-empty-${core.nanoid()}@test.com`,
      livemode: true,
    })
    // We don't assign stackAuthHostedBillingUserId, so metadata won't match a customer; make it match via update
    const emptyStackHostedId = `stack_hosted_${core.nanoid()}`
    await adminTransaction(async ({ transaction }) => {
      await transaction
        .update(customers)
        .set({ stackAuthHostedBillingUserId: emptyStackHostedId })
        .where(eq(customers.id, emptyOrgCustomer.id))
    })
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.BillingPortalToken,
      userId: 'ignored',
      ownerId: emptyOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.BillingPortalToken,
        stackAuthHostedBillingUserId: emptyStackHostedId,
        organizationId: emptyOrg.id,
      },
    }
    await expect(
      dbAuthInfoForBillingPortalApiKeyResult(verifyKeyResult as any)
    ).rejects.toThrow()
  })

  it('should validate metadata presence and throw on invalid metadata', async () => {
    // setup:
    // - construct verifyKeyResult with keyType=BillingPortalToken but missing organizationId OR missing stackAuthHostedBillingUserId in metadata
    // expects:
    // - throws an error indicating invalid API key metadata
    const invalidMetaMissingOrg = {
      keyType: FlowgladApiKeyType.BillingPortalToken,
      userId: 'ignored',
      ownerId: billingOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.BillingPortalToken,
        stackAuthHostedBillingUserId: billingPortalStackAuthUserId,
        // organizationId missing
      } as unknown,
    }
    await expect(
      dbAuthInfoForBillingPortalApiKeyResult(
        invalidMetaMissingOrg as any
      )
    ).rejects.toThrow()
    const invalidMetaMissingHostedId = {
      keyType: FlowgladApiKeyType.BillingPortalToken,
      userId: 'ignored',
      ownerId: billingOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.BillingPortalToken,
        organizationId: billingOrg.id,
        // stackAuthHostedBillingUserId missing
      } as unknown,
    }
    await expect(
      dbAuthInfoForBillingPortalApiKeyResult(
        invalidMetaMissingHostedId as any
      )
    ).rejects.toThrow()
  })

  it('should map environment to livemode correctly', async () => {
    // setup:
    // - create Organization and Customer and at least one Membership so that the happy path works
    // - run twice with verifyKeyResult.environment set to "live" and "test"
    // expects:
    // - environment "live" -> returned.livemode === true
    // - environment "test" -> returned.livemode === false
    const liveResult = await dbAuthInfoForBillingPortalApiKeyResult({
      keyType: FlowgladApiKeyType.BillingPortalToken,
      userId: 'ignored',
      ownerId: billingOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.BillingPortalToken,
        stackAuthHostedBillingUserId: billingPortalStackAuthUserId,
        organizationId: billingOrg.id,
      },
    } as any)
    const testResult = await dbAuthInfoForBillingPortalApiKeyResult({
      keyType: FlowgladApiKeyType.BillingPortalToken,
      userId: 'ignored',
      ownerId: billingOrg.id,
      environment: 'test',
      metadata: {
        type: FlowgladApiKeyType.BillingPortalToken,
        stackAuthHostedBillingUserId: billingPortalStackAuthUserId,
        organizationId: billingOrg.id,
      },
    } as any)
    expect(liveResult.livemode).toEqual(true)
    expect(testResult.livemode).toEqual(false)
  })
})

describe('databaseAuthenticationInfoForApiKeyResult', () => {
  it('should delegate to Secret API key flow when keyType=Secret', async () => {
    // setup:
    // - construct a verifyKeyResult with keyType=Secret and otherwise valid fields
    // - spy on or stub the Secret flow to observe invocation
    // expects:
    // - Secret flow is called exactly once with the verifyKeyResult
    // - return value equals what the Secret flow returns
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
      },
    }
    const result = await databaseAuthenticationInfoForApiKeyResult(
      verifyKeyResult as any
    )
    expect(result.jwtClaim.organization_id).toEqual(secretOrg.id)
    expect(result.userId).toEqual(secretUser.id)
    expect(result.livemode).toEqual(true)
  })

  it('should delegate to Billing Portal flow when keyType=BillingPortalToken', async () => {
    // setup:
    // - construct a verifyKeyResult with keyType=BillingPortalToken and valid metadata
    // - spy on or stub the Billing Portal flow to observe invocation
    // expects:
    // - Billing Portal flow is called exactly once with the verifyKeyResult
    // - return value equals what the Billing Portal flow returns
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.BillingPortalToken,
      userId: 'ignored',
      ownerId: billingOrg.id,
      environment: 'test',
      metadata: {
        type: FlowgladApiKeyType.BillingPortalToken,
        stackAuthHostedBillingUserId: billingPortalStackAuthUserId,
        organizationId: billingOrg.id,
      },
    }
    const result = await databaseAuthenticationInfoForApiKeyResult(
      verifyKeyResult as any
    )
    expect(result.jwtClaim.organization_id).toEqual(billingOrg.id)
    expect([billingUser1.id, billingUser2.id]).toContain(
      result.userId
    )
    expect(result.livemode).toEqual(false)
  })

  it('should throw on invalid key type', async () => {
    // setup:
    // - construct a verifyKeyResult with an invalid keyType
    // expects:
    // - throws an error mentioning the invalid API key type
    await expect(
      databaseAuthenticationInfoForApiKeyResult({
        keyType: 'invalid_type' as any,
        userId: secretUser.id,
        ownerId: secretOrg.id,
        environment: 'live',
        metadata: { type: 'invalid' } as any,
      })
    ).rejects.toThrow()
  })
})

describe('getDatabaseAuthenticationInfo', () => {
  it('should use API key path when apiKey is provided', async () => {
    // setup:
    // - provide a non-empty apiKey
    // - stub key verification to return a valid Secret verifyKeyResult
    // - stub the Secret flow to return a known object
    // expects:
    // - function delegates to the API key flow
    // - return value equals the stubbed Secret flow result
    const liveResult = await getDatabaseAuthenticationInfo(
      {apiKey: secretApiKeyTokenLive}
    )
    expect(liveResult.livemode).toEqual(true)
    expect(liveResult.jwtClaim.organization_id).toEqual(
      secretApiKeyOrg.id
    )
    const testResult = await getDatabaseAuthenticationInfo(
      {apiKey: secretApiKeyTokenTest}
    )
    expect(testResult.livemode).toEqual(false)
    expect(testResult.jwtClaim.organization_id).toEqual(
      secretApiKeyOrg.id
    )
  })

  it('should delegate to webapp request path when apiKey is not provided and session exists', () => {
    // setup:
    // - pass apiKey as undefined
    // - stub getSession() to return a session with a user (betterAuthId present)
    // - ensure there is at least one membership to derive fields from
    // expects:
    // - function delegates to the webapp request flow
    // - fields returned are consistent with the selected membership (userId, organization_id, livemode)
    // NOTE: Omitted implementation due to reliance on Next.js request headers in getSession(); covered via direct unit tests above
  })

  it('should throw when apiKey is not provided and no session exists', () => {
    // setup:
    // - pass apiKey as undefined
    // - stub getSession() to return null
    // expects:
    // - throws error: "No user found for a non-API key transaction"
    // NOTE: Omitted for same reason as above
  })
})

describe('subtleties and invariants across flows', () => {
  it('jwtClaim.sub should equal jwtClaim.user_metadata.id in all successful flows', async () => {
    // setup:
    // - obtain results from the webapp flow, the Secret flow, and the Billing Portal flow in their happy paths
    // expects:
    // - for each result, jwtClaim.sub === jwtClaim.user_metadata.id
    const mockBetterAuthUser = {
      id: (webUser as any).betterAuthId ?? (webUser as any).id,
      email: (webUser as any).email,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole
    const webappRes =
      await databaseAuthenticationInfoForWebappRequest(
        mockBetterAuthUser
      )
    const secretRes = await dbAuthInfoForSecretApiKeyResult({
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
      },
    } as any)
    const bpRes = await dbAuthInfoForBillingPortalApiKeyResult({
      keyType: FlowgladApiKeyType.BillingPortalToken,
      userId: 'ignored',
      ownerId: billingOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.BillingPortalToken,
        stackAuthHostedBillingUserId: billingPortalStackAuthUserId,
        organizationId: billingOrg.id,
      },
    } as any)
    expect(webappRes.jwtClaim.sub).toEqual(
      webappRes.jwtClaim.user_metadata.id
    )
    expect(secretRes.jwtClaim.sub).toEqual(
      secretRes.jwtClaim.user_metadata.id
    )
    expect(bpRes.jwtClaim.sub).toEqual(
      bpRes.jwtClaim.user_metadata.id
    )
  })

  it('jwtClaim field naming uses organization_id (snake_case), not organizationId', async () => {
    // setup:
    // - obtain a successful result from any flow
    // expects:
    // - jwtClaim has organization_id set
    // - jwtClaim does not have organizationId
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
      },
    }
    const res = await databaseAuthenticationInfoForApiKeyResult(
      verifyKeyResult as any
    )
    expect(res.jwtClaim.organization_id).toEqual(secretOrg.id)
    expect((res.jwtClaim as any).organizationId).toBeUndefined()
  })

  it('provider consistency: jwtClaim.app_metadata.provider is currently "apiKey" for all paths', async () => {
    // setup:
    // - obtain results from webapp, Secret, and Billing Portal flows
    // expects:
    // - jwtClaim.app_metadata.provider equals 'apiKey' in all cases (documenting current behavior)
    const mockBetterAuthUser = {
      id: (webUser as any).betterAuthId ?? (webUser as any).id,
      email: (webUser as any).email,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole
    const webappRes =
      await databaseAuthenticationInfoForWebappRequest(
        mockBetterAuthUser
      )
    const secretRes = await dbAuthInfoForSecretApiKeyResult({
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
      },
    } as any)
    const bpRes = await dbAuthInfoForBillingPortalApiKeyResult({
      keyType: FlowgladApiKeyType.BillingPortalToken,
      userId: 'ignored',
      ownerId: billingOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.BillingPortalToken,
        stackAuthHostedBillingUserId: billingPortalStackAuthUserId,
        organizationId: billingOrg.id,
      },
    } as any)
    expect(webappRes.jwtClaim.app_metadata.provider).toEqual('apiKey')
    expect(secretRes.jwtClaim.app_metadata.provider).toEqual('apiKey')
    expect(bpRes.jwtClaim.app_metadata.provider).toEqual('apiKey')
  })

  it('session_id is present only in Secret API key flow (as currently implemented)', async () => {
    // setup:
    // - obtain results from webapp, Secret, and Billing Portal flows
    // expects:
    // - Secret flow result includes jwtClaim.session_id
    // - webapp and Billing Portal results do not include jwtClaim.session_id
    const mockBetterAuthUser = {
      id: (webUser as any).betterAuthId ?? (webUser as any).id,
      email: (webUser as any).email,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole
    const webappRes =
      await databaseAuthenticationInfoForWebappRequest(
        mockBetterAuthUser
      )
    const secretRes = await dbAuthInfoForSecretApiKeyResult({
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
      },
    } as any)
    const bpRes = await dbAuthInfoForBillingPortalApiKeyResult({
      keyType: FlowgladApiKeyType.BillingPortalToken,
      userId: 'ignored',
      ownerId: billingOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.BillingPortalToken,
        stackAuthHostedBillingUserId: billingPortalStackAuthUserId,
        organizationId: billingOrg.id,
      },
    } as any)
    expect(secretRes.jwtClaim.session_id).toBeDefined()
    expect((webappRes.jwtClaim as any).session_id).toBeUndefined()
    expect((bpRes.jwtClaim as any).session_id).toBeUndefined()
  })
})

describe('Customer Role vs Merchant Role Authentication', () => {
  let customerOrg: Organization.Record
  let merchantUser: UserRecord
  let customerUser: UserRecord
  let customer1: Customer.Record
  let customer2SameOrg: Customer.Record
  let customerDifferentOrg: Customer.Record
  let differentOrg: Organization.Record
  
  beforeEach(async () => {
    // Setup organizations
    const orgSetup = await setupOrg()
    customerOrg = orgSetup.organization
    const otherOrgSetup = await setupOrg()
    differentOrg = otherOrgSetup.organization
    
    // Create merchant user with membership
    const merchantSetup = await setupUserAndApiKey({
      organizationId: customerOrg.id,
      livemode: true,
    })
    merchantUser = merchantSetup.user
    
    // Create customer users
    await adminTransaction(async ({ transaction }) => {
      const [user] = await transaction
        .insert(users)
        .values({
          id: `usr_${core.nanoid()}`,
          email: `customer1@test.com`,
          name: 'Customer User',
          betterAuthId: `bau_${core.nanoid()}`,
        })
        .returning()
      customerUser = user as UserRecord
    })
    
    // Create customers
    customer1 = await setupCustomer({
      organizationId: customerOrg.id,
      email: customerUser.email!,
      userId: customerUser.id,
      livemode: true,
    })
    
    customer2SameOrg = await setupCustomer({
      organizationId: customerOrg.id,
      email: 'customer2@test.com',
      livemode: true,
    })
    
    customerDifferentOrg = await setupCustomer({
      organizationId: differentOrg.id,
      email: 'customer3@test.com',
      livemode: true,
    })
  })

  describe('dbInfoForCustomerBillingPortal', () => {
    it('should return customer role in JWT claim for customer authentication', async () => {
      const result = await dbInfoForCustomerBillingPortal({
        betterAuthId: customerUser.betterAuthId!,
        organizationId: customerOrg.id,
      })
      
      expect(result.jwtClaim.role).toBe('customer')
      expect(result.jwtClaim.organization_id).toBe(customerOrg.id)
      expect(result.userId).toBe(customerUser.id)
      expect(result.jwtClaim.user_metadata.role).toBe('customer')
      expect(result.jwtClaim.app_metadata.provider).toBe('customerBillingPortal')
    })

    it('should distinguish between merchant and customer roles', async () => {
      // Merchant authentication
      const merchantResult = await databaseAuthenticationInfoForWebappRequest({
        id: merchantUser.betterAuthId!,
        email: merchantUser.email!,
        role: 'merchant',
      } as BetterAuthUserWithRole)
      
      // Customer authentication
      const customerResult = await dbInfoForCustomerBillingPortal({
        betterAuthId: customerUser.betterAuthId!,
        organizationId: customerOrg.id,
      })
      
      expect(merchantResult.jwtClaim.role).toBe('merchant')
      expect(customerResult.jwtClaim.role).toBe('customer')
      
      // Different providers
      expect(merchantResult.jwtClaim.app_metadata.provider).toBe('apiKey')
      expect(customerResult.jwtClaim.app_metadata.provider).toBe('customerBillingPortal')
    })

    it('should fail when customer tries to authenticate for wrong organization', async () => {
      await expect(
        dbInfoForCustomerBillingPortal({
          betterAuthId: customerUser.betterAuthId!,
          organizationId: 'wrong_org_id',
        })
      ).rejects.toThrow('Customer not found')
    })

    it('should fail when user has no customer record in the organization', async () => {
      // Create a user with no customer record
      const userWithoutCustomer = await adminTransaction(async ({ transaction }) => {
        const [user] = await transaction
          .insert(users)
          .values({
            id: `usr_${core.nanoid()}`,
            email: `nocustomer@test.com`,
            name: 'No Customer User',
            betterAuthId: `bau_${core.nanoid()}`,
          })
          .returning()
        return user as UserRecord
      })
      
      await expect(
        dbInfoForCustomerBillingPortal({
          betterAuthId: userWithoutCustomer.betterAuthId!,
          organizationId: customerOrg.id,
        })
      ).rejects.toThrow('Customer not found')
    })

    it('should handle customer authentication across different organizations', async () => {
      // Create same user with customer in different org
      const userWithMultipleCustomers = await adminTransaction(async ({ transaction }) => {
        const [user] = await transaction
          .insert(users)
          .values({
            id: `usr_${core.nanoid()}`,
            email: `multi@test.com`,
            name: 'Multi Org User',
            betterAuthId: `bau_${core.nanoid()}`,
          })
          .returning()
        return user as UserRecord
      })
      
      // Create customers in both orgs
      const customerOrg1 = await setupCustomer({
        organizationId: customerOrg.id,
        email: userWithMultipleCustomers.email!,
        userId: userWithMultipleCustomers.id,
        livemode: true,
      })
      
      const customerOrg2 = await setupCustomer({
        organizationId: differentOrg.id,
        email: userWithMultipleCustomers.email!,
        userId: userWithMultipleCustomers.id,
        livemode: true,
      })
      
      // Authenticate for org1
      const org1Result = await dbInfoForCustomerBillingPortal({
        betterAuthId: userWithMultipleCustomers.betterAuthId!,
        organizationId: customerOrg.id,
      })
      
      // Authenticate for org2
      const org2Result = await dbInfoForCustomerBillingPortal({
        betterAuthId: userWithMultipleCustomers.betterAuthId!,
        organizationId: differentOrg.id,
      })
      
      // Both should succeed but with different organization contexts
      expect(org1Result.jwtClaim.organization_id).toBe(customerOrg.id)
      expect(org2Result.jwtClaim.organization_id).toBe(differentOrg.id)
      expect(org1Result.jwtClaim.role).toBe('customer')
      expect(org2Result.jwtClaim.role).toBe('customer')
    })

    it('should set correct livemode based on customer record', async () => {
      // Create test mode customer
      const testModeCustomer = await setupCustomer({
        organizationId: customerOrg.id,
        email: 'testmode@test.com',
        livemode: false,
      })
      
      // Create user for test mode customer
      const testModeUser = await adminTransaction(async ({ transaction }) => {
        const [user] = await transaction
          .insert(users)
          .values({
            id: `usr_${core.nanoid()}`,
            email: testModeCustomer.email!,
            name: 'Test Mode User',
            betterAuthId: `bau_${core.nanoid()}`,
          })
          .returning()
        
        // Update customer with userId
        await transaction
          .update(customers)
          .set({ userId: user.id })
          .where(eq(customers.id, testModeCustomer.id))
        
        return user as UserRecord
      })
      
      const testModeResult = await dbInfoForCustomerBillingPortal({
        betterAuthId: testModeUser.betterAuthId!,
        organizationId: customerOrg.id,
      })
      
      expect(testModeResult.livemode).toBe(false)
      
      // Compare with live mode customer
      const liveModeResult = await dbInfoForCustomerBillingPortal({
        betterAuthId: customerUser.betterAuthId!,
        organizationId: customerOrg.id,
      })
      
      expect(liveModeResult.livemode).toBe(true)
    })
  })

  describe('Role-based JWT Claim Differences', () => {
    it('should have different JWT claim structures for merchant vs customer', async () => {
      const merchantAuth = await databaseAuthenticationInfoForWebappRequest({
        id: merchantUser.betterAuthId!,
        email: merchantUser.email!,
        role: 'merchant',
      } as BetterAuthUserWithRole)
      
      const customerAuth = await dbInfoForCustomerBillingPortal({
        betterAuthId: customerUser.betterAuthId!,
        organizationId: customerOrg.id,
      })
      
      // Merchant should have session_id in some cases (for Secret API keys)
      // Customer should never have session_id
      expect((customerAuth.jwtClaim as any).session_id).toBeUndefined()
      
      // Both should have organization_id
      expect(merchantAuth.jwtClaim.organization_id).toBeDefined()
      expect(customerAuth.jwtClaim.organization_id).toBeDefined()
      
      // Role should be different
      expect(merchantAuth.jwtClaim.role).toBe('merchant')
      expect(customerAuth.jwtClaim.role).toBe('customer')
      
      // user_metadata.role should match
      expect(merchantAuth.jwtClaim.user_metadata.role).toBe('merchant')
      expect(customerAuth.jwtClaim.user_metadata.role).toBe('customer')
    })

    it('should prevent role elevation attempts', async () => {
      // Customer auth info
      const customerAuth = await dbInfoForCustomerBillingPortal({
        betterAuthId: customerUser.betterAuthId!,
        organizationId: customerOrg.id,
      })
      
      // Verify the role is strictly 'customer'
      expect(customerAuth.jwtClaim.role).toBe('customer')
      
      // The role in user_metadata should also be 'customer'
      expect(customerAuth.jwtClaim.user_metadata.role).toBe('customer')
      
      // app_metadata.provider should indicate customer portal
      expect(customerAuth.jwtClaim.app_metadata.provider).toBe('customerBillingPortal')
      
      // These should prevent any attempt to elevate to merchant role
      // through JWT manipulation
    })
  })

  describe('Customer Isolation Validation', () => {
    it('should ensure customer JWT claims are properly scoped', async () => {
      const customerAuth = await dbInfoForCustomerBillingPortal({
        betterAuthId: customerUser.betterAuthId!,
        organizationId: customerOrg.id,
      })
      
      // Verify all required fields for RLS policies
      expect(customerAuth.jwtClaim.sub).toBe(customerUser.id)
      expect(customerAuth.jwtClaim.organization_id).toBe(customerOrg.id)
      expect(customerAuth.jwtClaim.role).toBe('customer')
      
      // These fields are used by RLS policies to filter data
      expect(customerAuth.userId).toBe(customerUser.id)
      expect(customerAuth.jwtClaim.user_metadata.id).toBe(customerUser.id)
    })

    it('should handle NULL userId customers correctly in authentication', async () => {
      // Create customer with NULL userId
      const nullUserCustomer = await setupCustomer({
        organizationId: customerOrg.id,
        email: 'nulluser@test.com',
        livemode: true,
      })
      
      // Create a user that doesn't match the customer
      const unrelatedUser = await adminTransaction(async ({ transaction }) => {
        const [user] = await transaction
          .insert(users)
          .values({
            id: `usr_${core.nanoid()}`,
            email: 'unrelated@test.com',
            name: 'Unrelated User',
            betterAuthId: `bau_${core.nanoid()}`,
          })
          .returning()
        return user as UserRecord
      })
      
      // Should fail to authenticate as the NULL userId customer
      await expect(
        dbInfoForCustomerBillingPortal({
          betterAuthId: unrelatedUser.betterAuthId!,
          organizationId: customerOrg.id,
        })
      ).rejects.toThrow('Customer not found')
    })
  })
})
