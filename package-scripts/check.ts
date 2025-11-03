import { runScriptForPackages } from './run-command.ts'

const args = process.argv.slice(2)

runScriptForPackages('check', args).catch((error) => {
  console.error(error)
  process.exit(1)
})
