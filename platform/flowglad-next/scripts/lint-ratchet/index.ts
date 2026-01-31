import { parseArgs } from 'util'
import { checkCommand } from './commands/check'
import { initCommand } from './commands/init'
import { statusCommand } from './commands/status'
import { updateCommand } from './commands/update'

const printUsage = (): void => {
  console.log(`
Usage: bun run scripts/lint-ratchet/index.ts <command> [options]

Commands:
  check                     Check violations against baseline (exits 1 if exceeded)
  init <rule> [options]     Initialize baseline for a rule
  status                    Show progress metrics (never fails)
  update                    Update baseline by ratcheting down counts

Init options:
  --force                   Skip confirmation prompt
  --package <path>          Only initialize specified package

Examples:
  bun run scripts/lint-ratchet/index.ts check
  bun run scripts/lint-ratchet/index.ts init no-explicit-any-in-tests
  bun run scripts/lint-ratchet/index.ts init no-explicit-any-in-tests --force
  bun run scripts/lint-ratchet/index.ts init no-explicit-any-in-tests --package platform/flowglad-next
  bun run scripts/lint-ratchet/index.ts status
  bun run scripts/lint-ratchet/index.ts update
`)
}

const main = async (): Promise<void> => {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      force: { type: 'boolean', default: false },
      package: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
    strict: false, // Allow unknown flags for forward compatibility
  })

  const command = positionals[0] || ''
  const ruleName = positionals[1]

  if (values.help) {
    printUsage()
    return
  }

  switch (command) {
    case 'check': {
      const result = await checkCommand()
      if (!result.passed) {
        process.exitCode = 1
      }
      break
    }

    case 'init': {
      if (!ruleName) {
        console.error('Error: init command requires a rule name')
        console.error(
          'Usage: bun run scripts/lint-ratchet/index.ts init <rule-name> [--force] [--package <path>]'
        )
        process.exitCode = 1
        return
      }
      await initCommand(ruleName, {
        force: values.force === true,
        package:
          typeof values.package === 'string'
            ? values.package
            : undefined,
      })
      break
    }

    case 'status': {
      await statusCommand()
      // status never fails
      break
    }

    case 'update': {
      await updateCommand()
      break
    }

    case 'help':
    case '': {
      printUsage()
      if (command === '') {
        process.exitCode = 1
      }
      break
    }

    default: {
      console.error(`Unknown command: ${command}`)
      printUsage()
      process.exitCode = 1
      break
    }
  }
}

main().catch((error) => {
  console.error('Error:', error.message)
  process.exitCode = 1
})
