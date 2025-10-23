'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import YAML from 'yaml'
import { setupPricingModelSchema } from '@/utils/pricingModels/setupSchemas'
import { Button } from '../ui/button'
import { Upload, FileCheck } from 'lucide-react'
import FileInput from '../FileInput'

interface ImportPricingModelProps {
  onParsedData: (data: any) => void
}

export function ImportPricingModel({
  onParsedData,
}: ImportPricingModelProps) {
  const [fileName, setFileName] = useState<string>('')

  //   const handleFileChange = async (
  //     e: React.ChangeEvent<HTMLInputElement>
  //   ) => {
  //     const file = e.target.files?.[0]
  //     if (!file) return

  //     try {
  //       const text = await file.text()
  //       const parsed = YAML.parse(text)
  //       const validated = setupPricingModelSchema.parse(parsed)
  //       onParsedData(validated)
  //       setFileName(file.name)
  //       //   toast.success('File validated successfully')
  //     } catch (error) {
  //       console.error('Error parsing YAML:', error)
  //       toast.error(
  //         error instanceof Error
  //           ? error.message
  //           : 'Invalid YAML file format'
  //       )
  //       onParsedData(null)
  //     }
  //   }

  return (
    <div>
      <div className="text-sm text-muted-foreground mb-4">
        Set up a pricing model by importing a YAML file
      </div>
      <FileInput
        directory="pricing-models"
        onUploadComplete={async ({ publicURL }) => {
          try {
            const response = await fetch(publicURL)
            const text = await response.text()
            const parsed = YAML.parse(text)
            const validated = setupPricingModelSchema.parse(parsed)
            onParsedData(validated)
            setFileName(parsed?.name || 'Imported YAML')
          } catch (error) {
            console.error('Error parsing YAML:', error)
            toast.error('Invalid YAML file format')
            onParsedData(null)
          }
        }}
        onUploadDeleted={() => {
          setFileName('')
          onParsedData(null)
        }}
        fileTypes={['yaml', 'yml']}
        // label=""
        singleOnly
        className="mb-4"
      />
      {/* <Button
        type="button"
        variant="outline"
        onClick={() =>
          document.getElementById('yaml-upload')?.click()
        }
        className="w-full"
      >
        <Upload className="w-4 h-4 mr-2" />
        {fileName || 'Choose YAML file'}
      </Button> */}
      {fileName && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
          <FileCheck className="w-4 h-4 text-green-600" />
          Selected pricing model: {fileName}
        </div>
      )}
    </div>
  )
}
