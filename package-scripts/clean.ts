import { runScriptForPackages } from './run-command.ts'

const args = process.argv.slice(2)

runScriptForPackages('clean', args).catch((error) => {
  console.error(error)
  process.exit(1)
})
