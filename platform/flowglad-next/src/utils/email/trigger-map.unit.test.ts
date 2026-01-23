import { describe, expect, it } from 'bun:test'
import { existsSync } from 'fs'
import path from 'path'
import type { EmailType } from './registry'
import { EMAIL_TRIGGER_MAP, getTriggerInfo } from './trigger-map'

describe('EMAIL_TRIGGER_MAP file references', () => {
  it('all triggerTask.file paths reference existing files', () => {
    for (const [emailType, info] of Object.entries(
      EMAIL_TRIGGER_MAP
    )) {
      const triggerPath = path.join(
        process.cwd(),
        info.triggerTask.file
      )
      expect(
        existsSync(triggerPath),
        `${emailType}: triggerTask.file not found at ${info.triggerTask.file}`
      ).toBe(true)
    }
  })

  it('all decisionFunction.file paths reference existing files', () => {
    for (const [emailType, info] of Object.entries(
      EMAIL_TRIGGER_MAP
    )) {
      if (info.decisionFunction) {
        const decisionPath = path.join(
          process.cwd(),
          info.decisionFunction.file
        )
        expect(
          existsSync(decisionPath),
          `${emailType}: decisionFunction.file not found at ${info.decisionFunction.file}`
        ).toBe(true)
      }
    }
  })

  it('all workflowFile paths reference existing files', () => {
    for (const [emailType, info] of Object.entries(
      EMAIL_TRIGGER_MAP
    )) {
      if (info.workflowFile) {
        const workflowPath = path.join(
          process.cwd(),
          info.workflowFile
        )
        expect(
          existsSync(workflowPath),
          `${emailType}: workflowFile not found at ${info.workflowFile}`
        ).toBe(true)
      }
    }
  })
})

describe('EMAIL_TRIGGER_MAP structure', () => {
  it('all entries have required fields with valid values', () => {
    for (const [emailType, info] of Object.entries(
      EMAIL_TRIGGER_MAP
    )) {
      // summary is a non-empty string
      expect(
        typeof info.summary === 'string' && info.summary.length > 0,
        `${emailType}: summary should be a non-empty string`
      ).toBe(true)

      // conditions is a non-empty array
      expect(
        Array.isArray(info.conditions) && info.conditions.length > 0,
        `${emailType}: conditions should be a non-empty array`
      ).toBe(true)

      // triggerTask has required fields
      expect(
        typeof info.triggerTask.file === 'string' &&
          info.triggerTask.file.length > 0,
        `${emailType}: triggerTask.file should be a non-empty string`
      ).toBe(true)

      expect(
        typeof info.triggerTask.taskId === 'string' &&
          info.triggerTask.taskId.length > 0,
        `${emailType}: triggerTask.taskId should be a non-empty string`
      ).toBe(true)

      // decisionFunction, if present, has required fields
      if (info.decisionFunction) {
        expect(
          typeof info.decisionFunction.file === 'string' &&
            info.decisionFunction.file.length > 0,
          `${emailType}: decisionFunction.file should be a non-empty string`
        ).toBe(true)

        expect(
          typeof info.decisionFunction.exportName === 'string' &&
            info.decisionFunction.exportName.length > 0,
          `${emailType}: decisionFunction.exportName should be a non-empty string`
        ).toBe(true)
      }

      // workflowFile, if present, is a non-empty string
      if (info.workflowFile) {
        expect(
          typeof info.workflowFile === 'string' &&
            info.workflowFile.length > 0,
          `${emailType}: workflowFile should be a non-empty string`
        ).toBe(true)
      }
    }
  })

  it('triggerTask.file paths follow consistent naming pattern', () => {
    for (const [emailType, info] of Object.entries(
      EMAIL_TRIGGER_MAP
    )) {
      expect(
        info.triggerTask.file.startsWith(
          'src/trigger/notifications/'
        ),
        `${emailType}: triggerTask.file should start with 'src/trigger/notifications/'`
      ).toBe(true)

      expect(
        info.triggerTask.file.endsWith('.ts'),
        `${emailType}: triggerTask.file should end with '.ts'`
      ).toBe(true)
    }
  })
})

describe('getTriggerInfo', () => {
  it('returns trigger info for mapped email types', () => {
    const mappedTypes = Object.keys(EMAIL_TRIGGER_MAP) as EmailType[]

    for (const emailType of mappedTypes) {
      const info = getTriggerInfo(emailType)
      const expected = EMAIL_TRIGGER_MAP[emailType] ?? null
      expect(info).toEqual(expected)
    }
  })

  it('returns null for unmapped email types', () => {
    const unmappedType = 'nonexistent.email.type' as EmailType
    const info = getTriggerInfo(unmappedType)
    expect(info).toEqual(null)
  })
})
