'use client'

import { useFormContext } from 'react-hook-form'
import { CreateFileInput } from '@/db/schema/files'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import FileInput from '../FileInput'

export const FileFormFields = ({
  basePath,
}: {
  basePath?: string
}) => {
  const form = useFormContext<CreateFileInput>()
  const namePath = `${basePath}.file.name` as 'file.name'
  const objectKeyPath =
    `${basePath}.file.objectKey` as 'file.objectKey'
  return (
    <>
      <FormField
        control={form.control}
        name={namePath}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input
                placeholder="File name"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FileInput
        onUploadComplete={({ objectKey }) => {
          form.setValue(objectKeyPath, objectKey)
        }}
        onUploadDeleted={({ objectKey }) => {
          form.setValue(objectKeyPath, '')
        }}
        directory="files"
        id={`${basePath}-file-input`}
        singleOnly
      />
    </>
  )
}
