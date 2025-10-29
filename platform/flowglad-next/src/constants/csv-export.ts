/**
 * Constants for CSV export functionality
 * 
 * This is a temporary limit to prevent abuse of the CSV export feature 
 * until we have a proper asynchronous export feature for large datasets.
 */

export const CSV_EXPORT_LIMITS = {
  /** Maximum number of customers that can be exported via CSV without contacting support */
  CUSTOMER_LIMIT: 300,
} as const
