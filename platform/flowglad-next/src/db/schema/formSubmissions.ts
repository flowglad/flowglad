import { z } from 'zod'
import { pgTable, jsonb, pgPolicy } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  notNullStringForeignKey,
  enhancedCreateInsertSchema,
  constructIndex,
  tableBase,
  newBaseZodSelectSchemaColumns,
  livemodePolicy,
} from '@/db/tableUtils'
import { forms } from '@/db/schema/forms'
import { users } from '@/db/schema/users'
import core from '@/utils/core'
import { FormFieldType } from '@/types'
import { sql } from 'drizzle-orm'

const TABLE_NAME = 'form_submissions'

export const formSubmissions = pgTable(
  TABLE_NAME,
  {
    ...tableBase('form_submission'),
    FormId: notNullStringForeignKey('form_id', forms),
    UserId: notNullStringForeignKey('user_id', users),
    response: jsonb('response').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.FormId]),
      constructIndex(TABLE_NAME, [table.UserId]),
      pgPolicy('Enable all for own forms', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"FormId" in (select "id" from "Forms")`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

export const formSubmissionsSelectSchema = createSelectSchema(
  formSubmissions,
  newBaseZodSelectSchemaColumns
)

export const formSubmissionsInsertSchema = enhancedCreateInsertSchema(
  formSubmissions,
  newBaseZodSelectSchemaColumns
)

export const formSubmissionsUpdateSchema = formSubmissionsInsertSchema
  .partial()
  .extend({
    id: z.string(),
  })

export type FormSubmissionInsert = z.infer<
  typeof formSubmissionsInsertSchema
>

export type FormSubmissionUpdate = z.infer<
  typeof formSubmissionsUpdateSchema
>

export type FormSubmissionRecord = z.infer<
  typeof formSubmissionsSelectSchema
>

export const shortAnswerFormFieldResponseSchema = z.object({
  question: z.string(),
  type: z.literal(FormFieldType.ShortAnswer),
  response: z.string(),
})

export type ShortAnswerFormFieldResponse = z.infer<
  typeof shortAnswerFormFieldResponseSchema
>

export const paragraphAnswerFormFieldResponseSchema = z.object({
  question: z.string(),
  type: z.literal(FormFieldType.ParagraphAnswer),
  response: z.string(),
})
export type ParagraphAnswerFormFieldResponse = z.infer<
  typeof paragraphAnswerFormFieldResponseSchema
>

export const multipleChoiceFormFieldResponseSchema = z.object({
  question: z.string(),
  type: z.literal(FormFieldType.MultipleChoice),
  response: z.string(),
})
export type MultipleChoiceFormFieldResponse = z.infer<
  typeof multipleChoiceFormFieldResponseSchema
>

export const dropdownFormFieldResponseSchema = z.object({
  question: z.string(),
  type: z.literal(FormFieldType.Dropdown),
  response: z.string(),
})
export type DropdownFormFieldResponse = z.infer<
  typeof dropdownFormFieldResponseSchema
>

export const timeFormFieldResponseSchema = z.object({
  question: z.string(),
  type: z.literal(FormFieldType.Time),
  response: z.string(),
})

export type TimeFormFieldResponse = z.infer<
  typeof timeFormFieldResponseSchema
>

export const checkboxesFormFieldResponseSchema = z.object({
  question: z.string(),
  type: z.literal(FormFieldType.Checkboxes),
  response: z.array(z.string()),
})

export type CheckboxesFormFieldResponse = z.infer<
  typeof checkboxesFormFieldResponseSchema
>

export const fileUploadFormFieldResponseSchema = z.object({
  question: z.string(),
  type: z.literal(FormFieldType.FileUpload),
  response: z.object({
    urls: z.array(z.string()),
  }),
})
export type FileUploadFormFieldResponse = z.infer<
  typeof fileUploadFormFieldResponseSchema
>

export const dateFormFieldResponseSchema = z.object({
  question: z.string(),
  type: z.literal(FormFieldType.Date),
  response: z.date(),
})
export type DateFormFieldResponse = z.infer<
  typeof dateFormFieldResponseSchema
>

export const formFieldResponseSchema = z.discriminatedUnion('type', [
  shortAnswerFormFieldResponseSchema,
  paragraphAnswerFormFieldResponseSchema,
  multipleChoiceFormFieldResponseSchema,
  dropdownFormFieldResponseSchema,
  timeFormFieldResponseSchema,
  checkboxesFormFieldResponseSchema,
  fileUploadFormFieldResponseSchema,
  dateFormFieldResponseSchema,
])

export type FormFieldResponse = z.infer<
  typeof formFieldResponseSchema
>

export const formSubmissionResponseSchema = z.object({
  question: z.string(),
  type: core.createSafeZodEnum(FormFieldType),
  response: formFieldResponseSchema.array(),
})

export type FormSubmissionResponse = z.infer<
  typeof formSubmissionResponseSchema
>
