import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { printHelp } from './help'

describe('help command', () => {
  let consoleOutput: string[]
  const originalLog = console.log

  beforeEach(() => {
    consoleOutput = []
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '))
    }
  })

  afterEach(() => {
    console.log = originalLog
  })

  it('displays the help message with all command names and descriptions when invoked', () => {
    printHelp()

    const output = consoleOutput.join('\n')

    expect(output).toContain('Flowglad CLI')
    expect(output).toContain('Usage: flowglad <command>')
    expect(output).toContain('help')
    expect(output).toContain('login')
    expect(output).toContain('logout')
    expect(output).toContain('link')
    expect(output).toContain('pull')
    expect(output).toContain('push')
    expect(output).toContain('deploy')
    expect(output).toContain('coming soon')
    expect(output).toContain('https://flowglad.com/docs/cli')
  })
})
