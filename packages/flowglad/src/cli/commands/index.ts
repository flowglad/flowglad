import type { CAC } from 'cac'
import { registerHelpCommand } from './help'
import { registerLogoutCommand } from './logout'

/**
 * Register all CLI commands with the CLI instance.
 * Add new commands here as they are implemented.
 */
export const registerCommands = (cli: CAC): void => {
  registerHelpCommand(cli)
  registerLogoutCommand(cli)

  // Future commands (Milestone 1+):
  // registerLoginCommand(cli)
  // registerLinkCommand(cli)
  // registerPullCommand(cli)
  // registerPushCommand(cli)
  // registerDeployCommand(cli)
}
