import { adminTransaction } from '@/db/adminTransaction'
import { selectApiKeys } from '@/db/tableMethods/apiKeyMethods'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import core from '@/utils/core'
import {
  NextContext,
  NextRequestWithUnkeyContext,
  UnkeyContext,
} from '@unkey/nextjs'
import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function testAPIHandlerWrapper(
  handler: (
    req: NextRequestWithUnkeyContext,
    context: NextContext
  ) => Promise<Response | NextResponse>
) {
  return async (req: NextRequest, context: NextContext) => {
    if (!core.IS_TEST) {
      throw new Error(
        'testAPIHandlerWrapper was called in non-test environment.'
      )
    }
    const apiKeyFromHeader =
      req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!apiKeyFromHeader) {
      return NextResponse.json(
        { error: 'Missing API key' },
        { status: 401 }
      )
    }
    const { apiKeyRecord, membershipAndUser } =
      await adminTransaction(async ({ transaction }) => {
        const [apiKeyRecord] = await selectApiKeys(
          {
            token: apiKeyFromHeader,
          },
          transaction
        )
        const [membershipAndUser] =
          await selectMembershipsAndUsersByMembershipWhere(
            {
              organizationId: apiKeyRecord.organizationId,
            },
            transaction
          )
        return { apiKeyRecord, membershipAndUser }
      })
    if (!apiKeyRecord) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }
    const unkeyContext: UnkeyContext = {
      ownerId: apiKeyRecord.organizationId,
      environment: 'test',
      keyId: apiKeyFromHeader,
      expires: undefined,
      meta: {
        userId: membershipAndUser.user.id,
      },
      name: 'testmode-key',
      valid: true,
      code: 'VALID',
      identity: {
        id: 'testmode-identity',
        externalId: apiKeyRecord.id,
        meta: {
          userId: membershipAndUser.user.id,
        },
      },
    }
    return handler(
      Object.assign(req, { unkey: unkeyContext }),
      context
    )
  }
}
