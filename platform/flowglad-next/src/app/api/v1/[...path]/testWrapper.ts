import { adminTransaction } from '@/db/adminTransaction'
import { selectApiKeys } from '@/db/tableMethods/apiKeyMethods'
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
    const [apiKeyRecord] = await adminTransaction(
      async ({ transaction }) => {
        return await selectApiKeys(
          {
            token: apiKeyFromHeader,
          },
          transaction
        )
      }
    )
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
      meta: {},
      name: 'testmode-key',
      valid: true,
      code: 'VALID',
      identity: {
        id: 'testmode-identity',
        externalId: apiKeyRecord.id,
        meta: {},
      },
    }
    return handler(
      Object.assign(req, { unkey: unkeyContext }),
      context
    )
  }
}
