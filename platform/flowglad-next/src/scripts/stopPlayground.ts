/**
 * Stop all playground services that were started by initPlayground.
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const REPO_ROOT = path.resolve(__dirname, '../../../..')
const LOGS_DIR = path.join(REPO_ROOT, '.playground-logs')
const PIDS_FILE = path.join(LOGS_DIR, '.pids.json')

// Ports used by playground services
const SERVICE_PORTS = {
  platform: 3000,
  playground: 3001,
}

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
}

const SYMBOLS = {
  check: '\u2714',
  cross: '\u2716',
  info: '\u2139',
}

function logError(message: string): void {
  console.error(
    `${COLORS.red}${SYMBOLS.cross}${COLORS.reset} ${message}`
  )
}

function logSuccess(message: string): void {
  console.log(
    `${COLORS.green}${SYMBOLS.check}${COLORS.reset} ${message}`
  )
}

function logInfo(message: string): void {
  console.log(
    `${COLORS.yellow}${SYMBOLS.info}${COLORS.reset} ${message}`
  )
}

/**
 * Kill processes listening on a specific port.
 * Returns true if any processes were killed.
 */
function killByPort(port: number, name: string): boolean {
  try {
    // Use lsof to find PIDs listening on the port
    const result = execSync(`lsof -ti :${port}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    if (!result) {
      return false
    }

    const pids = result.split('\n').filter(Boolean)
    let killed = false

    for (const pidStr of pids) {
      const pid = parseInt(pidStr, 10)
      if (!isNaN(pid)) {
        try {
          process.kill(pid, 'SIGKILL')
          killed = true
        } catch {
          // Process may have already exited
        }
      }
    }

    if (killed) {
      logSuccess(`Stopped ${name} on port ${port}`)
    }
    return killed
  } catch {
    // lsof returns non-zero if no processes found
    return false
  }
}

function killProcessGroup(pid: number, name: string): boolean {
  try {
    // Kill the entire process group by using negative PID
    // This ensures child processes (like next dev spawned by bun) are also killed
    process.kill(-pid, 'SIGTERM')
    logSuccess(`Stopped ${name} (PID: ${pid} and children)`)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      // Process group not found, try killing just the process
      try {
        process.kill(pid, 'SIGTERM')
        logSuccess(`Stopped ${name} (PID: ${pid})`)
        return true
      } catch (innerError) {
        if ((innerError as NodeJS.ErrnoException).code === 'ESRCH') {
          logInfo(`${name} was not running (PID: ${pid})`)
        } else {
          logError(
            `Failed to stop ${name} (PID: ${pid}): ${innerError}`
          )
        }
        return false
      }
    } else if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      // Permission denied for process group, try individual process
      try {
        process.kill(pid, 'SIGTERM')
        logSuccess(`Stopped ${name} (PID: ${pid})`)
        return true
      } catch (innerError) {
        logError(
          `Failed to stop ${name} (PID: ${pid}): ${innerError}`
        )
        return false
      }
    } else {
      logError(`Failed to stop ${name} (PID: ${pid}): ${error}`)
    }
    return false
  }
}

function main(): void {
  console.log('\nStopping playground services...\n')

  let pids: {
    platform?: number
    playground?: number
    trigger?: number
  } = {}
  let hasPidFile = false

  // Try to read PID file
  if (fs.existsSync(PIDS_FILE)) {
    try {
      pids = JSON.parse(fs.readFileSync(PIDS_FILE, 'utf-8'))
      hasPidFile = true
    } catch (error) {
      logInfo(`Could not read PID file, will use port-based cleanup`)
    }
  }

  let stopped = 0

  // Stop Trigger.dev (only via PID, no port fallback)
  if (pids.trigger) {
    if (killProcessGroup(pids.trigger, 'Trigger.dev')) stopped++
  }

  // Stop Playground - try PID first, then fallback to port
  if (pids.playground) {
    if (killProcessGroup(pids.playground, 'Playground')) stopped++
  }
  // Always try port-based cleanup to catch orphan processes
  if (killByPort(SERVICE_PORTS.playground, 'Playground')) {
    if (!pids.playground) stopped++
  }

  // Stop Platform - try PID first, then fallback to port
  if (pids.platform) {
    if (killProcessGroup(pids.platform, 'Platform')) stopped++
  }
  // Always try port-based cleanup to catch orphan processes
  if (killByPort(SERVICE_PORTS.platform, 'Platform')) {
    if (!pids.platform) stopped++
  }

  // Clean up PID file
  if (hasPidFile) {
    try {
      fs.unlinkSync(PIDS_FILE)
    } catch {
      // Ignore errors when removing PID file
    }
  }

  if (stopped === 0 && !hasPidFile) {
    logInfo('No running services found.')
  }

  console.log(
    `\n${COLORS.green}${SYMBOLS.check}${COLORS.reset} Done.\n`
  )
}

main()
