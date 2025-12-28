/**
 * Flowglad LLC legal entity information for Merchant of Record (MoR) invoices.
 * MoR invoices are issued FROM Flowglad LLC TO the customer.
 */
export const FLOWGLAD_LEGAL_ENTITY = {
  name: 'Flowglad LLC',
  address: {
    // FIXME: fill in with real values
    line1: '[TBD - Legal Address Line 1]',
    city: '[TBD - City]',
    state: '[TBD - State]',
    postal_code: '[TBD - Postal Code]',
    country: 'US',
  },
  // FIXME: fill in with real values
  contactEmail: 'billing@flowglad.com',
  // FIXME: fill in with real values
  logoURL: '[TBD - Flowglad Logo URL]',
  // FIXME: fill in with real values
  taxId: '[TBD - Flowglad EIN]',
  /** What appears on customer card statements for MoR transactions */
  cardStatementDescriptor: 'FLGLD*',
} as const
