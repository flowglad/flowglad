/**
 * Compatibility shim.
 *
 * `@flowglad/server` exposes the Better Auth integration via the subpath export
 * `@flowglad/server/better-auth`, which maps to `dist/<format>/better-auth.js`.
 *
 * That build artifact is generated from this file (`src/better-auth.ts`). The
 * implementation lives in the folder-based module `src/better-auth/`.
 */
export type {
  BetterAuthSessionResult,
  FlowgladBetterAuthPluginOptions,
  FlowgladEndpointError,
} from './better-auth/index'

export {
  createFlowgladCustomerForOrganization,
  endpointKeyToActionKey,
  flowgladPlugin,
  getOrganizationDetails,
  resolveCustomerExternalId,
} from './better-auth/index'
