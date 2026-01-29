// Main library entry point (for future monopackage)
// Currently exports nothing - CLI is the primary interface

declare const PACKAGE_VERSION: string

export const VERSION = PACKAGE_VERSION

// Future: re-export from @flowglad/shared, @flowglad/server, etc.
