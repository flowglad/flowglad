import type { CAC } from 'cac'

interface CommandInfo {
  name: string
  description: string
  status: 'available' | 'coming-soon'
}

const commands: CommandInfo[] = [
  {
    name: 'help',
    description: 'Display this help message',
    status: 'available',
  },
  {
    name: 'login',
    description: 'Authenticate via OAuth',
    status: 'coming-soon',
  },
  {
    name: 'logout',
    description: 'Clear stored credentials',
    status: 'available',
  },
  {
    name: 'link',
    description: 'Link to an organization and pricing model',
    status: 'coming-soon',
  },
  {
    name: 'pull',
    description: 'Download pricing model to pricing.yaml',
    status: 'coming-soon',
  },
  {
    name: 'push',
    description: 'Upload pricing.yaml to linked pricing model',
    status: 'coming-soon',
  },
  {
    name: 'deploy',
    description: 'Promote test pricing model to live',
    status: 'coming-soon',
  },
]

export const printHelp = (): void => {
  console.log('\nFlowglad CLI - Manage your Flowglad configuration\n')
  console.log('Usage: flowglad <command> [options]\n')
  console.log('Commands:\n')

  const maxNameLength = Math.max(
    ...commands.map((c) => c.name.length)
  )

  for (const cmd of commands) {
    const padding = ' '.repeat(maxNameLength - cmd.name.length + 2)
    const statusIndicator =
      cmd.status === 'coming-soon' ? ' (coming soon)' : ''
    console.log(
      `  ${cmd.name}${padding}${cmd.description}${statusIndicator}`
    )
  }

  console.log(
    '\nRun `flowglad <command> --help` for command-specific help.\n'
  )
  console.log('Documentation: https://flowglad.com/docs/cli')
}

export const registerHelpCommand = (cli: CAC): void => {
  cli.command('help', 'Display help information').action(() => {
    printHelp()
  })
}
