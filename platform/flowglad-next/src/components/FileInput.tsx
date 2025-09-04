'use client'

import React, { useState } from 'react'
import core, { cn } from '@/utils/core'
import { trpc } from '@/app/_trpc/client'

import { FileUploadData, Nullish } from '@/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Plus, X, File as FileIcon } from 'lucide-react'

interface FileInputProps {
  directory: string
  onUploadComplete?: (data: FileUploadData) => void
  onUploadDeleted?: (data: FileUploadData) => void
  onUploadError?: (error: Error) => void
  initialURL?: Nullish<string>
  singleOnly?: boolean
  label?: string
  className?: string
  id?: string
  error?: string
  /**
   * The label to display inside the box below "Drag and drop or click to upload"
   */
  subLabel?: string
  /**
   * The hint to display below the file input
   */
  hint?: string | React.ReactNode
  /**
   * The file types to accept. If provided, files not matching these types will be rejected.
   */
  fileTypes?: string[]
}

interface FileUploadDataWithType extends FileUploadData {
  fileType: string
  file?: File
}

const isFileTypeImage = (fileType: string) =>
  fileType.startsWith('image/') ||
  fileType === 'png' ||
  fileType === 'svg' ||
  fileType === 'webp' ||
  fileType === 'jpg' ||
  fileType === 'jpeg'

const FileInput: React.FC<FileInputProps> = ({
  directory,
  onUploadComplete,
  onUploadDeleted,
  onUploadError,
  singleOnly = false,
  fileTypes,
  label,
  className,
  initialURL,
  id = 'fileInput',
  subLabel,
  error,
  hint,
}) => {
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<
    FileUploadDataWithType[]
  >([])
  const getPresignedURL = trpc.utils.getPresignedURL.useMutation()

  React.useEffect(() => {
    if (initialURL) {
      setUploadedFiles([
        {
          publicURL: initialURL,
          /**
           * Object key is the file name without the domain and leading slash
           */
          objectKey: initialURL.replace(/^https?:\/\/[^/]+\/?/, ''),
          fileType: initialURL.substring(
            initialURL.lastIndexOf('.') + 1
          ),
          file: new File(
            [],
            initialURL.substring(initialURL.lastIndexOf('/') + 1)
          ),
        },
      ])
    }
  }, [initialURL])

  const deleteFile = (fileDetails: FileUploadDataWithType) => {
    const updatedFiles = uploadedFiles.filter(
      (file) => file.objectKey !== fileDetails.objectKey
    )
    setUploadedFiles(updatedFiles)
    onUploadDeleted?.(fileDetails)
  }

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const key = `${core.nanoid()}${file.name.substring(
          file.name.lastIndexOf('.')
        )}`
        const { data } = await getPresignedURL.mutateAsync({
          key,
          directory,
          contentType: file.type,
        })

        const response = await fetch(data.presignedURL, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
          },
        })

        if (!response.ok) {
          throw new Error(`Failed to upload file: ${file.name}`)
        }
        return {
          ...data,
          file,
          fileType: file.type,
        }
      })

      const fileUploadsWithFiles = await Promise.all(uploadPromises)

      fileUploadsWithFiles.forEach((data) =>
        onUploadComplete?.({
          objectKey: data.objectKey,
          publicURL: data.publicURL,
        })
      )

      const newUploadedFiles = [
        ...uploadedFiles,
        ...fileUploadsWithFiles,
      ]

      setUploadedFiles(newUploadedFiles)
    } catch (error) {
      console.error('Error uploading files:', error)
      onUploadError?.(
        error instanceof Error
          ? error
          : new Error('Unknown error occurred')
      )
    } finally {
      setIsUploading(false)
    }
  }
  const preview =
    uploadedFiles.length > 0 ? (
      <div className="w-full h-full flex items-center justify-center gap-2">
        {uploadedFiles.map((file, index) => (
          <div
            key={index}
            className="flex flex-row items-center gap-2"
          >
            {isFileTypeImage(file.fileType) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={index}
                src={file.publicURL}
                alt={`Uploaded file ${index + 1}`}
                className={cn(
                  `max-w-full object-contain rounded-md h-[100px] w-auto`
                )}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center gap-2">
                <FileIcon size={16} />
                <div className="text-xs text-subtle">
                  {file.file?.name ?? file.objectKey.split('/').pop()}
                </div>
              </div>
            )}
            <div>
              <Button
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteFile(file)
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        {!singleOnly && (
          <div className="max-w-full max-h-[100px] object-contain rounded-md">
            <Button
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                document.getElementById(id)?.click()
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add File
            </Button>
          </div>
        )}
      </div>
    ) : (
      <div className="w-full relative flex flex-col items-center justify-center gap-1 font-medium text-sm h-[100px] m-auto">
        <div className="w-fit relative flex justify-center items-center gap-1.5 text-foreground">
          {isUploading
            ? 'Uploading...'
            : 'Click to upload, or drag and drop'}
        </div>
        <div
          className={cn(
            'w-full relative flex flex-col justify-center items-center gap-1',
            isUploading && 'opacity-50'
          )}
        >
          <div className="text-xs text-center text-subtle w-full">
            {fileTypes && fileTypes.length > 0
              ? `${fileTypes
                  .map((type) => `.${type}`)
                  .join(', ')} allowed`
              : ''}
          </div>
        </div>
      </div>
    )
  let hintElement = null
  if (typeof hint === 'string') {
    hintElement = (
      <div className="text-xs text-subtle mt-1">{hint}</div>
    )
  } else if (React.isValidElement(hint)) {
    hintElement = hint
  }
  return (
    <div className={className}>
      {label && <Label className="mb-1">{label}</Label>}
      <div
        className={core.cn(
          'w-full min-w-[320px] relative flex flex-col items-center gap-1 p-4 rounded-radius-md border-2 border-stroke-subtle border-dashed cursor-pointer transition-colors duration-200 hover:border-primary',
          isDragging && 'border-primary bg-container-high',
          uploadedFiles.length > 0 &&
            'border-solid border-stroke-subtle border'
        )}
        onClick={() => document.getElementById(id)?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(false)
          const files = e.dataTransfer.files
          if (files && files.length > 0) {
            handleFileChange({
              target: { files },
            } as React.ChangeEvent<HTMLInputElement>)
          }
        }}
      >
        <div className="w-full relative flex flex-col items-center gap-3">
          <input
            id={id}
            type="file"
            onChange={handleFileChange}
            disabled={isUploading}
            className="hidden"
            multiple={!singleOnly}
            accept={fileTypes?.join(',') ?? undefined}
          />
          {preview}
        </div>
      </div>
      {error && (
        <div className="text-sm text-destructive mt-1">{error}</div>
      )}
      {hintElement}
    </div>
  )
}

export default FileInput
