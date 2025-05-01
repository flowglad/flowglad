// utils/logger.ts

const log = console

type LogData = Record<string, unknown>

export const logger = {
  debug: (message: string, data?: LogData) => {
    log.debug(message, data)
  },

  info: (message: string, data?: LogData) => {
    log.info(message, data)
  },

  warn: (message: string, data?: LogData) => {
    log.warn(message, data)
  },

  error: (message: string | Error, data?: LogData) => {
    const enrichedData = data

    if (message instanceof Error) {
      log.error(message.message, {
        ...enrichedData,
        error_name: message.name,
        error_stack: message.stack,
      })
    } else {
      log.error(message, enrichedData)
    }
  },
}
