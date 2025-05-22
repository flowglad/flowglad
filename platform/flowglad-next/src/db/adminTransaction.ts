import { AdminTransactionParams } from '@/db/types'
import db from './client'
import { sql } from 'drizzle-orm'
import { isNil } from '@/utils/core'
import { Event } from './schema/events'
import {
  bulkInsertOrDoNothingEvents,
  bulkInsertOrDoNothingEventsByHash,
} from './tableMethods/eventMethods'

// New imports for ledger and transaction output types
import { TransactionOutput } from './transactionEnhacementTypes'
import { processLedgerCommand } from './ledgerManager'

interface AdminTransactionOptions {
  livemode?: boolean
}
// This method needs to be in its own module, because
// comingling it with `authenticatedTransaction` in the same file
// can cause issues where we execute stackAuth code globally that
// only works in the context of a nextjs sessionful runtime.

/**
 * Original adminTransaction. Consider deprecating or refactoring to use comprehensiveAdminTransaction.
 */
export async function adminTransaction<T>(
  fn: (params: AdminTransactionParams) => Promise<T>,
  options: AdminTransactionOptions = {}
) {
  const { livemode = true } = options
  return db.transaction(async (transaction) => {
    /**
     * Reseting the role and request.jwt.claims here,
     * becuase the auth state seems to be returned to the client "dirty",
     * with the role from the previous session still applied.
     */
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', NULL, true);`
    )

    const resp = await fn({
      transaction, // Cast to DrizzleTransaction
      userId: 'ADMIN',
      livemode: isNil(livemode) ? true : livemode,
    })
    await transaction.execute(sql`RESET ROLE;`)
    return resp
  })
}

/**
 * New comprehensive admin transaction handler.
 * Takes a function that returns TransactionOutput, and handles event logging and ledger commands.
 */
export async function comprehensiveAdminTransaction<T>(
  fn: (
    params: AdminTransactionParams
  ) => Promise<TransactionOutput<T>>,
  options: AdminTransactionOptions = {}
): Promise<T> {
  const { livemode = true } = options

  return db.transaction(async (transaction) => {
    // Set up transaction context (e.g., clearing previous JWT claims)
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', NULL, true);`
    )
    // Admin transactions typically run with higher privileges, no specific role needs to be set via JWT claims normally.

    const paramsForFn: AdminTransactionParams = {
      transaction,
      userId: 'ADMIN', // Or appropriate admin identifier
      livemode: isNil(livemode) ? true : livemode,
    }

    const output = await fn(paramsForFn)

    // Process events if any
    if (output.eventsToLog && output.eventsToLog.length > 0) {
      await bulkInsertOrDoNothingEventsByHash(
        output.eventsToLog,
        transaction
      )
    }

    // Process ledger command if any
    if (output.ledgerCommand) {
      await processLedgerCommand(
        output.ledgerCommand,
        paramsForFn,
        transaction
      )
    }

    // No RESET ROLE typically needed here as admin role wasn't set via session context

    return output.result
  })
}

/**
 * Original eventfulAdminTransaction.
 * Consider deprecating or refactoring to use comprehensiveAdminTransaction.
 * If kept, it could be a wrapper that adapts the old fn signature to TransactionOutput.
 */
export async function eventfulAdminTransaction<T>(
  fn: (
    params: AdminTransactionParams
  ) => Promise<[T, Event.Insert[]]>,
  options: AdminTransactionOptions
) {
  // This is now a simple wrapper around comprehensiveAdminTransaction
  return comprehensiveAdminTransaction(async (params) => {
    const [result, eventInserts] = await fn(params)
    return {
      result,
      eventsToLog: eventInserts,
    }
  }, options)
}
