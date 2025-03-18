import { generateObject, CoreMessage, GenerateObjectResult } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { Nouns, Verbs } from '@/types'
import {
  EditClassification,
  editSchema,
} from '@/ai/editClassifierSchema'

interface CreateClassification {
  verb: Verbs.Create
  noun: Nouns
}

export type Classification = CreateClassification | EditClassification

const verbSystemPrompt = `You are a router for an AI application, and the user just sent a new prompt. 
You need to classify the verb so we can determine which action to take.
The "verb" has possible values: ${Object.values(Verbs).join(', ')}

Currently, the following nouns are supported: ${Object.values(
  Nouns
).join(
  ', '
)}. Use this list to help refer to which noun is the object of the user's request, vs indirect object. We are looking to classify the direct object, that is either being edited or created.

The user's request will always be a single noun and verb.

Sometimes the user might "tag" or @ mention a specific record in their prompt.

If they do you must first identify whether the @ mentioned record is the record the user wishes to act on, or a parent or child of the record they wish to act on.

For example:
"Create a new price for @product_123456" -> { verb: ${
  Verbs.Create
} } // The user is creating a new price for the tagged product
"Rename @product_123456 to 'New Name'" -> { verb: ${
  Verbs.Edit
} } // The user is editing the tagged product
"New file for @product_123456" -> { verb: ${
  Verbs.Create
} } // The user is creating a new file for the tagged product
`

const editNounSystemPrompt = `You are a router for an AI application, and the user just sent a new prompt describine their intent to edit an existing record. 

You need to classify the noun so we can determine which action to take.

The "noun" has possible values: ${Object.values(Nouns).join(', ')}

The user's request will always be a single noun and verb.

We know that the user wants to edit a record, but we need to determine:
- the type of record they want to edit
- what criteria to use to select for the existing record from the database

IMPORTANT:
The user may tag or @ mention a specific record in their prompt. If they do, you must determine whether that record is the one they want to edit, or a child or parent of the record they want to edit. If it is a child or parent of the actual record, you must remember that.

Examples:
"Archive @product_123456" -> { noun: ${
  Nouns.Product
}, recordSelectionCriteria: { id: 'product_123456' } } // The user is editing the tagged product
"Rename @product_123456 default price to 'Starter Pack'" -> { noun: ${
  Nouns.Price
}, recordSelectionCriteria: { productId: 'product_123456', default: true } } // The user is editing the default price of the tagged product
`

const createNounSystemPrompt = `You are a router for an AI application, and the user just sent a new prompt describine their intent to create a new record.

You need to classify the noun so we can determine which action to take.

The "noun" has possible values: ${Object.values(Nouns).join(', ')}

The user's request will always be a single noun and verb.

IMPORTANT:
The user may tag or @ mention a specific record in their prompt. If they do, you must determine whether that record is the one they want to act on, or a child or parent of the record they want to act on. If it is a child or parent of the actual record, you must remember that.

Examples:
"Create a new price for @product_123456" -> { noun: ${
  Nouns.Price
} } // The user is creating a new price for the tagged product
"New file for @product_123456" -> { noun: ${
  Nouns.File
} } // The user is creating a new file for the tagged product
`

export const classifyNounAndVerb = async ({
  messages,
}: {
  messages: CoreMessage[]
}): Promise<Classification> => {
  const verbResult: GenerateObjectResult<{ verb: Verbs }> =
    await generateObject({
      model: openai('gpt-4o'),
      schema: z.object({ verb: z.nativeEnum(Verbs) }),
      system: verbSystemPrompt,
      messages,
    })
  if (verbResult.object.verb === Verbs.Edit) {
    const editResult = await generateObject({
      model: openai('gpt-4o'),
      schema: editSchema,
      system: editNounSystemPrompt,
      messages,
    })
    return {
      verb: Verbs.Edit,
      noun: editResult.object.noun,
      recordSelectionCriteria:
        editResult.object.recordSelectionCriteria,
    }
  }

  const createResult: GenerateObjectResult<{ noun: Nouns }> =
    await generateObject({
      model: openai('gpt-4o'),
      schema: z.object({ noun: z.nativeEnum(Nouns) }),
      system: createNounSystemPrompt,
      messages,
    })
  return {
    verb: Verbs.Create,
    noun: createResult.object.noun,
  }
}
