import type { Flowglad } from '@flowglad/node'

export type Payment = Flowglad.PaymentClientSelectSchema

export type PaymentStatus = Payment['status']

export type PaymentMethodType = Payment['paymentMethod']
