import { z } from 'zod'
import {
  pgTable,
  integer,
  text,
  boolean,
  jsonb,
  pgPolicy,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import {
  pgEnumColumn,
  tableBase,
  constructIndex,
  notNullStringForeignKey,
  newBaseZodSelectSchemaColumns,
  livemodePolicy,
} from '@/db/tableUtils'
import { forms, formsInsertSchema } from '@/db/schema/forms'
import core from '@/utils/core'
import { FormFieldType } from '@/types'
import { sql } from 'drizzle-orm'

const TABLE_NAME = 'form_fields'

export const formFields = pgTable(
  TABLE_NAME,
  {
    ...tableBase('form_field'),
    order: integer('order').notNull(),
    FormId: notNullStringForeignKey('form_id', forms),
    type: pgEnumColumn({
      enumName: 'FormFieldType',
      columnName: 'type',
      enumBase: FormFieldType,
    }),
    question: text('question').notNull(),
    description: text('description'),
    required: boolean('required').notNull().default(false),
    fieldParameters: jsonb('field_parameters'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.FormId]),
      constructIndex(TABLE_NAME, [table.type]),
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

const columnRefinements = {
  order: core.safeZodPositiveInteger,
  type: core.createSafeZodEnum(FormFieldType),
}

export const formFieldMultipleChoiceParametersSchema = z.object({
  options: z.array(z.string()),
  includeOther: z.boolean().nullish(),
})

export type FormFieldMultipleChoiceParameters = z.infer<
  typeof formFieldMultipleChoiceParametersSchema
>

export const formFieldCheckboxParametersSchema =
  formFieldMultipleChoiceParametersSchema

export type FormFieldCheckboxParameters = z.infer<
  typeof formFieldCheckboxParametersSchema
>

export const formFieldDropdownParametersSchema =
  formFieldMultipleChoiceParametersSchema.omit({
    includeOther: true,
  })

export type FormFieldDropdownParameters = z.infer<
  typeof formFieldDropdownParametersSchema
>

export const formFieldFileUploadParametersSchema = z.object({
  maxFileSize: z.number().nullish(),
})

export type FormFieldFileUploadParameters = z.infer<
  typeof formFieldFileUploadParametersSchema
>

export const formFieldDateParametersSchema = z.object({
  maxDate: z.date().nullish(),
  minDate: z.date().nullish(),
})

export type FormFieldDateParameters = z.infer<
  typeof formFieldDateParametersSchema
>

const coreSelectSchema = createSelectSchema(formFields, {
  ...newBaseZodSelectSchemaColumns,
  ...columnRefinements,
})

const coreInsertSchema = createInsertSchema(
  formFields,
  columnRefinements
)

const multipleChoiceFormFieldInsert = coreInsertSchema.extend({
  fieldParameters: formFieldMultipleChoiceParametersSchema,
  type: z.literal(FormFieldType.MultipleChoice),
})

const multipleChoiceFormFieldSelect = coreSelectSchema.extend({
  fieldParameters: formFieldMultipleChoiceParametersSchema,
  type: z.literal(FormFieldType.MultipleChoice),
})

const checkboxFormFieldInsert = coreInsertSchema.extend({
  fieldParameters: formFieldCheckboxParametersSchema,
  type: z.literal(FormFieldType.Checkboxes),
})

const checkboxFormFieldSelect = coreSelectSchema.extend({
  fieldParameters: formFieldCheckboxParametersSchema,
  type: z.literal(FormFieldType.Checkboxes),
})

const dropdownFormFieldInsert = coreInsertSchema.extend({
  fieldParameters: formFieldDropdownParametersSchema,
  type: z.literal(FormFieldType.Dropdown),
})

const dropdownFormFieldSelect = coreSelectSchema.extend({
  fieldParameters: formFieldDropdownParametersSchema,
  type: z.literal(FormFieldType.Dropdown),
})

const fileUploadFormFieldInsert = coreInsertSchema.extend({
  fieldParameters: formFieldFileUploadParametersSchema,
  type: z.literal(FormFieldType.FileUpload),
})

const fileUploadFormFieldSelect = coreSelectSchema.extend({
  fieldParameters: formFieldFileUploadParametersSchema,
  type: z.literal(FormFieldType.FileUpload),
})

const dateFormFieldInsert = coreInsertSchema.extend({
  fieldParameters: formFieldDateParametersSchema,
  type: z.literal(FormFieldType.Date),
})

const dateFormFieldSelect = coreSelectSchema.extend({
  fieldParameters: formFieldDateParametersSchema,
  type: z.literal(FormFieldType.Date),
})

const formFieldParagraphAnswerParametersSchema = z.object({
  maxLength: z.number().optional(),
})

const paragraphAnswerFormFieldInsert = coreInsertSchema.extend({
  fieldParameters: formFieldParagraphAnswerParametersSchema,
  type: z.literal(FormFieldType.ParagraphAnswer),
})

const paragraphAnswerFormFieldSelect = coreSelectSchema.extend({
  fieldParameters: formFieldParagraphAnswerParametersSchema,
  type: z.literal(FormFieldType.ParagraphAnswer),
})

const formFieldShortAnswerParametersSchema = z.object({
  maxLength: z.number().optional(),
})

const shortAnswerFormFieldInsert = coreInsertSchema.extend({
  fieldParameters: formFieldShortAnswerParametersSchema,
  type: z.literal(FormFieldType.ShortAnswer),
})

const shortAnswerFormFieldSelect = coreSelectSchema.extend({
  fieldParameters: formFieldShortAnswerParametersSchema,
  type: z.literal(FormFieldType.ShortAnswer),
})

export const formFieldsSelectSchema = z.discriminatedUnion('type', [
  multipleChoiceFormFieldSelect,
  checkboxFormFieldSelect,
  dropdownFormFieldSelect,
  fileUploadFormFieldSelect,
  dateFormFieldSelect,
  paragraphAnswerFormFieldSelect,
  shortAnswerFormFieldSelect,
])

export const formFieldsInsertSchema = z.discriminatedUnion('type', [
  multipleChoiceFormFieldInsert,
  checkboxFormFieldInsert,
  dropdownFormFieldInsert,
  fileUploadFormFieldInsert,
  dateFormFieldInsert,
  paragraphAnswerFormFieldInsert,
  shortAnswerFormFieldInsert,
])

const toUpdateSchema = <
  T extends z.ZodObject<
    {
      type: z.ZodLiteral<FormFieldType>
    },
    any,
    any
  >,
>(
  schema: T
) => {
  const schemaType = schema.shape.type
  return schema.partial().extend({
    type: schemaType,
    id: z.string(),
  })
}

const multipleChoiceFormFieldUpdate = toUpdateSchema(
  multipleChoiceFormFieldInsert
)
const checkboxFormFieldUpdate = toUpdateSchema(
  checkboxFormFieldInsert
)
const dropdownFormFieldUpdate = toUpdateSchema(
  dropdownFormFieldInsert
)
const fileUploadFormFieldUpdate = toUpdateSchema(
  fileUploadFormFieldInsert
)
const dateFormFieldUpdate = toUpdateSchema(dateFormFieldInsert)

export const formFieldsUpdateSchema = z.discriminatedUnion('type', [
  multipleChoiceFormFieldUpdate,
  checkboxFormFieldUpdate,
  dropdownFormFieldUpdate,
  fileUploadFormFieldUpdate,
  dateFormFieldUpdate,
])

export namespace FormField {
  export type Insert = z.infer<typeof formFieldsInsertSchema>
  export type Update = z.infer<typeof formFieldsUpdateSchema>
  export type Record = z.infer<typeof formFieldsSelectSchema>
  /**
   * Hacks - we need to create client representations of the types,
   * but it's a lot of boilerplate.
   *
   * TODO
   */
  export type ClientInsert = Insert
  export type ClientUpdate = Update
  export type ClientRecord = Record
}

export const createFormInputSchema = z.object({
  form: formsInsertSchema,
  formFields: formFieldsInsertSchema.array(),
})

export type CreateFormInput = z.infer<typeof createFormInputSchema>
