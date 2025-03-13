You are adding support for a new database table to be taggable as a proper noun.

## 1. Update enum Nouns in @/types.ts
- Include the new noun in the enum. It should be the singular PascalCase version of the table name:

```ts
export enum Nouns {
  Product = 'product',
// ... rest of the enum
  UnicornRider = 'unicornRider',
}
```

## 2. Add support for the new noun in properNounHelpers.ts:
1. Add a new entry to the `databaseTablesForNoun` object in `@/utils/properNounHelpers.ts`:
   ```ts
   export const databaseTablesForNoun: Record<Nouns, string> = {
     // ... existing entries
     [Nouns.UnicornRider]: 'UnicornRiders',
   }
   ```

2. Add a new function to handle the conversion of the new table's records to proper noun upserts in `@/utils/properNounHelpers.ts`:
   ```ts
   export const unicornRiderRecordToProperNounUpsert = (
     params: CreateProperNounUpsertParams<UnicornRider.Record>
   ): ProperNoun.Insert => {
     return {
       EntityId: params.record.id,
       entityType: 'unicornRider',
       name: params.record.name,
       organizationId: params.organizationId,
     }
   }
   ```

3. Add a new case to the `supabasePayloadToProperNounUpsert` function in `@/utils/properNounHelpers.ts`:
   ```ts
   export const supabasePayloadToProperNounUpsert = async (
     payload: SupabaseInsertPayload | SupabaseUpdatePayload,
     organizationId: string
   ): Promise<ProperNoun.Insert> => {
     let properNounUpsert: ProperNoun.Insert | null = null

     switch (payload.table) {
       // ... existing cases
       case 'UnicornRiders':
         properNounUpsert = unicornRiderRecordToProperNounUpsert({
           record: payload.record as UnicornRider.Record,
           organizationId: (payload.record as UnicornRider.Record).organizationId,
         })
         break
       default:
         throw new Error('Invalid table')
     }

     if (!properNounUpsert) {
       throw new Error('Invalid table')
     }

     return properNounUpsert
   }
   ```
