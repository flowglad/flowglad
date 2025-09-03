import {
  SquareArrowOutUpRight,
  File as FileIcon,
  Link as LinkIcon,
  Pencil,
  Trash,
  Download,
} from 'lucide-react'
import { File } from '@/db/schema/files'
import { Link } from '@/db/schema/links'
import { MigrationButton as Button } from '@/components/ui/button-migration'
import { useState } from 'react'
import EditFileModal from '@/components/forms/EditFileModal'
import EditLinkModal from '@/components/forms/EditLinkModal'
import DeleteFileModal from '@/components/forms/DeleteFileModal'
import DeleteLinkModal from '@/components/forms/DeleteLinkModal'

interface FilePostPurchaseAsset {
  asset: File.ClientRecord
  type: 'file'
}

interface LinkPostPurchaseAsset {
  asset: Link.ClientRecord
  type: 'link'
}

export type PostPurchaseAsset =
  | FilePostPurchaseAsset
  | LinkPostPurchaseAsset

type PostPurchaseAssetMode = 'customer' | 'seller'

export type PostPurchaseAssetRowProps = PostPurchaseAsset & {
  mode: PostPurchaseAssetMode
  itemIcon: React.ReactNode
  buttonStrip?: React.ReactNode
  modals?: React.ReactNode
}

const PostPurchaseAssetButtonStrip = ({
  setIsEditOpen,
  setIsDeleteOpen,
}: {
  setIsEditOpen: (open: boolean) => void
  setIsDeleteOpen: (open: boolean) => void
}) => {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        iconLeading={<Pencil size={16} />}
        onClick={() => setIsEditOpen(true)}
      >
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        iconLeading={<Trash size={16} />}
        onClick={() => setIsDeleteOpen(true)}
      >
        Delete
      </Button>
    </>
  )
}

const PostPurchaseAssetRow = ({
  asset,
  mode,
  itemIcon,
  buttonStrip,
  modals,
}: PostPurchaseAssetRowProps) => {
  return (
    <div className="w-full flex items-center justify-between py-4 px-3 bg-container bg-nav border border-stroke-subtle rounded-radius [&:not(:only-child)]:rounded-none [&:not(:only-child)]:border-t-0 [&:not(:only-child)]:first:border-t [&:not(:only-child)]:first:rounded-t-radius [&:not(:only-child)]:last:rounded-b-radius">
      <div className="flex items-center gap-3 w-full">
        <div className="flex items-center justify-center w-8 h-8 rounded-radius bg-input">
          {itemIcon}
        </div>
        <div className="flex flex-col w-full">
          <div className="text-sm font-medium text-foreground">
            {asset.name}
          </div>
          {mode === 'seller' && (
            <div className="text-xs text-subtle">
              Available after purchase
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 justify-end items-end">
        {buttonStrip}
      </div>
      {modals}
    </div>
  )
}

export const FilePostPurchaseAssetRow = ({
  file,
  mode,
}: {
  file: File.ClientRecord
  mode: PostPurchaseAssetMode
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const downloadIcon = <Download size={16} />
  return (
    <>
      <PostPurchaseAssetRow
        asset={file}
        type="file"
        mode={mode}
        itemIcon={<FileIcon size={16} />}
        buttonStrip={
          mode === 'customer' ? (
            <Button
              variant="ghost"
              size="sm"
              iconLeading={downloadIcon}
              onClick={() => {
                window.open(file.cdnUrl, '_blank')
              }}
            >
              Download
            </Button>
          ) : (
            <PostPurchaseAssetButtonStrip
              setIsEditOpen={setIsEditOpen}
              setIsDeleteOpen={setIsDeleteOpen}
            />
          )
        }
        modals={
          mode === 'seller' && (
            <>
              <EditFileModal
                isOpen={isEditOpen}
                setIsOpen={setIsEditOpen}
                file={file}
              />
              <DeleteFileModal
                isOpen={isDeleteOpen}
                setIsOpen={setIsDeleteOpen}
                id={file.id}
              />
            </>
          )
        }
      />
    </>
  )
}

export const LinkPostPurchaseAssetRow = ({
  link,
  mode,
}: {
  link: Link.ClientRecord
  mode: PostPurchaseAssetMode
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  return (
    <>
      <PostPurchaseAssetRow
        asset={link}
        type="link"
        mode={mode}
        itemIcon={<LinkIcon />}
        buttonStrip={
          mode === 'customer' ? (
            <Button
              variant="ghost"
              size="sm"
              iconLeading={<SquareArrowOutUpRight size={16} />}
              onClick={() => window.open(link.url, '_blank')}
            >
              Open
            </Button>
          ) : (
            <PostPurchaseAssetButtonStrip
              setIsEditOpen={setIsEditOpen}
              setIsDeleteOpen={setIsDeleteOpen}
            />
          )
        }
        modals={
          mode === 'seller' && (
            <>
              <EditLinkModal
                isOpen={isEditOpen}
                setIsOpen={setIsEditOpen}
                link={link}
              />
              <DeleteLinkModal
                isOpen={isDeleteOpen}
                setIsOpen={setIsDeleteOpen}
                id={link.id}
              />
            </>
          )
        }
      />
    </>
  )
}
