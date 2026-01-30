import type { CAC } from 'cac'
import { registerHelpCommand } from './help'
import { registerLoginCommand } from './login'

/**
 * Register all CLI commands with the CLI instance.
 * Add new commands here as they are implemented.
 */
export const registerCommands = (cli: CAC): void => {
  registerHelpCommand(cli)
  registerLoginCommand(cli)

  // Future commands (Milestone 1+):
  // registerLogoutCommand(cli)
  // registerLinkCommand(cli)
  // registerPullCommand(cli)
  // registerPushCommand(cli)
  // registerDeployCommand(cli)
}
