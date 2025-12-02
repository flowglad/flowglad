// ⚠️ DEPRECATED: This package is deprecated. Use @flowglad/shared instead.
// All type definitions have been moved to @flowglad/shared.
// See: https://github.com/flowglad/flowglad/tree/main/packages/shared
if (typeof console !== 'undefined' && console.warn) {
  console.warn(
    '\x1b[33m%s\x1b[0m',
    '[@flowglad/types] DEPRECATED: This package is deprecated and will no longer receive updates. ' +
      'Please migrate to @flowglad/shared. ' +
      'See: https://github.com/flowglad/flowglad/tree/main/packages/shared'
  )
}

export * from './paymentMethod'
export * from './subscription'
export * from './invoice'
export * from './customer'
export * from './payment'
export * from './currency'
export * from './catalog'
export * from './usage'
export * from './checkoutSession'
