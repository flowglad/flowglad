import type { CAC } from 'cac'
import { registerHelpCommand } from './help'
import { registerLinkCommand } from './link'
import { registerLoginCommand } from './login'
import { registerLogoutCommand } from './logout'

/**
 * Register all CLI commands with the CLI instance.
 * Add new commands here as they are implemented.
 */
export const registerCommands = (cli: CAC): void => {
  registerHelpCommand(cli)
  registerLinkCommand(cli)
  registerLoginCommand(cli)
  registerLogoutCommand(cli)

  // Future commands (Milestone 2+):
  // registerPullCommand(cli)
  // registerPushCommand(cli)
  // registerDeployCommand(cli)
}
