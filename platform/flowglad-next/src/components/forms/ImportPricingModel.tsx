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
        singleOnly
        className="mb-4"
      />
      {fileName && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
          <FileCheck className="w-4 h-4 text-green-600" />
          Selected pricing model: {fileName}
        </div>
      )}
    </div>
  )
}
