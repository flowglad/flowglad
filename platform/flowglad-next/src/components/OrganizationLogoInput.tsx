'use client'

import React from 'react'
import FileInput from '@/components/FileInput'
import { Label } from '@/components/ui/label'

interface OrganizationLogoInputProps {
  /**
   * The current logo URL value
   */
  value?: string | null
  /**
   * Callback when logo is uploaded
   */
  onUploadComplete: (publicURL: string) => void
  /**
   * Callback when logo is deleted
   */
  onUploadDeleted: () => void
  /**
   * Unique ID for the file input element
   */
  id?: string
  /**
   * Optional label text (defaults to "Company logo")
   */
  label?: string
  /**
   * Optional description text shown below the input
   */
  description?: string
  /**
   * Optional className for the container
   */
  className?: string
}

/**
 * Reusable component for organization logo upload/update/delete.
 */
const OrganizationLogoInput: React.FC<OrganizationLogoInputProps> = ({
  value,
  onUploadComplete,
  onUploadDeleted,
  id = 'organization-logo-upload',
  label = 'Company logo',
  description = 'This logo appears in your dashboard navigation and customer-facing invoices.',
  className,
}) => {
  return (
    <div className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className={label ? 'max-w-md mt-2' : 'max-w-md'}>
        <FileInput
          directory="organizations"
          singleOnly
          id={id}
          fileTypes={[
            'png',
            'jpeg',
            'jpg',
            'gif',
            'webp',
            'svg',
            'avif',
          ]}
          initialURL={value ?? undefined}
          onUploadComplete={({ publicURL }) =>
            onUploadComplete(publicURL)
          }
          onUploadDeleted={onUploadDeleted}
          hint="Recommended square image. Max size 2MB."
        />
      </div>
      {description && (
        <div className="text-xs text-muted-foreground mt-1">
          {description}
        </div>
      )}
    </div>
  )
}

export default OrganizationLogoInput
