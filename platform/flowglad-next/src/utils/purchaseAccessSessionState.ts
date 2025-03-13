import { cookies } from 'next/headers'
import {
  selectPurchaseAccessSessions,
  insertPurchaseAccessSession,
  updatePurchaseAccessSession,
} from '@/db/tableMethods/purchaseAccessSessionMethods'
import { PurchaseAccessSessionSource } from '@/types'
import { DbTransaction } from '@/db/types'
import { PurchaseAccessSession } from '@/db/schema/purchaseAccessSessions'
import core from '@/utils/core'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'

const purchaseAccessSessionName = (purchaseId: string) =>
  `purchase-access-session-id-${purchaseId}`

/**
 * We must support multiple purchase access session cookies on the client,
 * one for each purchase. Otherwise, the client will not be able to
 * tell which purchase access session corresponds to which purchase.
 *
 * Purchase access sessions are used to manage access to purchased content
 * after payment is complete.
 */
export const getPurchaseAccessSessionCookie = (
  purchaseId: string
) => {
  return cookies().get(purchaseAccessSessionName(purchaseId))?.value
}

export const findPurchaseAccessSession = async (
  purchaseId: string,
  transaction: DbTransaction
): Promise<PurchaseAccessSession.Record | null> => {
  const purchaseAccessSessionToken =
    getPurchaseAccessSessionCookie(purchaseId)

  if (!purchaseAccessSessionToken) {
    return null
  }

  const sessions = await selectPurchaseAccessSessions(
    { token: purchaseAccessSessionToken },
    transaction
  )

  if (sessions.length === 0) {
    return null
  }
  const session = sessions[0]
  if (session.expires && session.expires < new Date()) {
    return null
  }

  return session
}

export const createPurchaseAccessSession = async (
  params: {
    purchaseId: string
    source: PurchaseAccessSessionSource
    autoGrant: boolean
    livemode: boolean
  },
  transaction: DbTransaction
) => {
  const purchaseAccessSession = await insertPurchaseAccessSession(
    {
      purchaseId: params.purchaseId,
      token: core.nanoid(),
      source: params.source,
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      granted: params.autoGrant,
      livemode: params.livemode,
    },
    transaction
  )
  setPurchaseAccessSessionCookie({
    purchaseId: params.purchaseId,
    purchaseAccessSessionToken: purchaseAccessSession.token,
  })
  return purchaseAccessSession
}

export const setPurchaseAccessSessionCookie = (params: {
  purchaseId: string
  purchaseAccessSessionToken: string
}) => {
  const { purchaseId, purchaseAccessSessionToken } = params
  return cookies().set(
    purchaseAccessSessionName(purchaseId),
    purchaseAccessSessionToken,
    {
      maxAge: 60 * 60 * 24 * 7, // 7 days
    }
  )
}

export const exchangeTokenForPurchaseAccessSession = async (
  token: string,
  transaction: DbTransaction
) => {
  const [purchaseAccessSession] = await selectPurchaseAccessSessions(
    { token, granted: false },
    transaction
  )
  if (!purchaseAccessSession) {
    return null
  }
  await updatePurchaseAccessSession(
    { id: purchaseAccessSession.id, granted: true },
    transaction
  )
  const purchase = await selectPurchaseById(
    purchaseAccessSession.purchaseId,
    transaction
  )

  setPurchaseAccessSessionCookie({
    purchaseId: purchase.id,
    purchaseAccessSessionToken: purchaseAccessSession.token,
  })

  return { purchaseAccessSession, purchase }
}
