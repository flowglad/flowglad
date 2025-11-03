/**
 * Constants for CSV export functionality
 *
 * This is a temporary limit until we have a proper asynchronous export feature for large datasets.
 */

export const CSV_EXPORT_LIMITS = {
  /** Maximum number of customers that can be exported via CSV without contacting support */
  CUSTOMER_LIMIT: 1000,
} as const
