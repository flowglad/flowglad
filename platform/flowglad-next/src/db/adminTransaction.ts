import { SpanKind } from '@opentelemetry/api'
import { sql } from 'drizzle-orm'
import type { AdminTransactionParams } from '@/db/types'
import { isNil } from '@/utils/core'
import { setTransactionOperationLabel } from '@/utils/operationContext'
import { withSpan } from '@/utils/tracing'
import db from './client'
import { processLedgerCommand } from './ledgerManager/ledgerManager'
import type { Event } from './schema/events'
import { bulkInsertOrDoNothingEventsByHash } from './tableMethods/eventMethods'
// New imports for ledger and transaction output types
import type { TransactionOutput } from './transactionEnhacementTypes'

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
  const effectiveLivemode = isNil(livemode) ? true : livemode
  return withSpan(
    {
      spanName: 'db.adminTransaction',
      tracerName: 'db.transaction',
      kind: SpanKind.CLIENT,
      attributes: {
        'db.transaction.type': 'admin',
        'db.user_id': 'ADMIN',
        'db.livemode': effectiveLivemode,
      },
    },
    async () => {
      return db.transaction(async (transaction) => {
        /**
         * Reseting the role and request.jwt.claims here,
         * becuase the auth state seems to be returned to the client "dirty",
         * with the role from the previous session still applied.
         */
        await transaction.execute(
          sql`SELECT set_config('request.jwt.claims', NULL, true);`
        )
        // Set operation label for query debugging (automatically derived from TRPC path or Trigger task)
        await setTransactionOperationLabel(transaction)

        const resp = await fn({
          transaction, // Cast to DrizzleTransaction
          userId: 'ADMIN',
          livemode: effectiveLivemode,
        })
        await transaction.execute(sql`RESET ROLE;`)
        return resp
      })
    }
  )
}

/**
 * Executes a function within an admin database transaction and automatically processes
 * events and ledger commands from the transaction output.
 *
 * @param fn - Function that receives admin transaction parameters and returns a TransactionOutput
 *   containing the result, optional events to insert, and optional ledger commands to process
 * @param options - Transaction options including livemode flag
 * @returns Promise resolving to the result value from the transaction function
 *
 * @example
 * ```ts
 * const result = await comprehensiveAdminTransaction(async (params) => {
 *   // ... perform operations ...
 *   return {
 *     result: someValue,
 *     eventsToInsert: [event1, event2],
 *     ledgerCommand: { type: 'credit', amount: 100 }
 *   }
 * })
 * ```
 */
export async function comprehensiveAdminTransaction<T>(
  fn: (
    params: AdminTransactionParams
  ) => Promise<TransactionOutput<T>>,
  options: AdminTransactionOptions = {}
): Promise<T> {
  const { livemode = true } = options
  const effectiveLivemode = isNil(livemode) ? true : livemode

  return withSpan(
    {
      spanName: 'db.comprehensiveAdminTransaction',
      tracerName: 'db.transaction',
      kind: SpanKind.CLIENT,
      attributes: {
        'db.transaction.type': 'admin',
        'db.user_id': 'ADMIN',
        'db.livemode': effectiveLivemode,
      },
    },
    async (span) => {
      return db.transaction(async (transaction) => {
        // Set up transaction context (e.g., clearing previous JWT claims)
        await transaction.execute(
          sql`SELECT set_config('request.jwt.claims', NULL, true);`
        )
        // Set operation label for query debugging (automatically derived from TRPC path or Trigger task)
        await setTransactionOperationLabel(transaction)
        // Admin transactions typically run with higher privileges, no specific role needs to be set via JWT claims normally.

        const paramsForFn: AdminTransactionParams = {
          transaction,
          userId: 'ADMIN', // Or appropriate admin identifier
          livemode: effectiveLivemode,
        }

        const output = await fn(paramsForFn)

        // Set additional attributes after transaction completes
        span.setAttributes({
          'db.events_count': output.eventsToInsert?.length ?? 0,
          'db.ledger_commands_count': output.ledgerCommand
            ? 1
            : (output.ledgerCommands?.length ?? 0),
        })

        // Validate that only one of ledgerCommand or ledgerCommands is provided
        if (
          output.ledgerCommand &&
          output.ledgerCommands &&
          output.ledgerCommands.length > 0
        ) {
          throw new Error(
            'Cannot provide both ledgerCommand and ledgerCommands. Please provide only one.'
          )
        }

        // Process events if any
        if (
          output.eventsToInsert &&
          output.eventsToInsert.length > 0
        ) {
          await bulkInsertOrDoNothingEventsByHash(
            output.eventsToInsert,
            transaction
          )
        }

        // Process ledger commands if any
        if (output.ledgerCommand) {
          await processLedgerCommand(
            output.ledgerCommand,
            transaction
          )
        } else if (
          output.ledgerCommands &&
          output.ledgerCommands.length > 0
        ) {
          for (const command of output.ledgerCommands) {
            await processLedgerCommand(command, transaction)
          }
        }

        // No RESET ROLE typically needed here as admin role wasn't set via session context

        return output.result
      })
    }
  )
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
      eventsToInsert: eventInserts,
    }
  }, options)
}
