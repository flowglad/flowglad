import cac from 'cac'
import { registerCommands } from './commands'

declare const PACKAGE_VERSION: string

const cli = cac('flowglad')

cli.version(PACKAGE_VERSION)
cli.help()

registerCommands(cli)

cli.parse()
