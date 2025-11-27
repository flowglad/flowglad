import type { Flowglad } from '@flowglad/node'

export type PurchaseInvoice =
  Flowglad.PurchaseInvoiceClientSelectSchema

export type SubscriptionInvoice =
  Flowglad.SubscriptionInvoiceClientSelectSchema

export type StandaloneInvoice =
  Flowglad.StandaloneInvoiceClientSelectSchema
export type Invoice =
  | SubscriptionInvoice
  | PurchaseInvoice
  | StandaloneInvoice

export type InvoiceLineItem =
  | Flowglad.StaticInvoiceLineItemClientSelectSchema
  | Flowglad.UsageInvoiceLineItemClientSelectSchema

export type InvoiceStatus = Invoice['status']

export interface InvoiceDisplayProps {
  showTaxDetails?: boolean
  condensed?: boolean
}

export interface InvoiceActionOptions {
  allowDownload?: boolean
  allowPayment?: boolean
}
