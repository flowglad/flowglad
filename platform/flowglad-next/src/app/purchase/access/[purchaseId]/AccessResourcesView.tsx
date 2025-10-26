'use client'
import JSZip from 'jszip'
import { TableHeader } from '@/components/ui/table-header'
import {
  FilePostPurchaseAssetRow,
  LinkPostPurchaseAssetRow,
} from '@/components/PostPurchaseAssetRow'
import { File } from '@/db/schema/files'
import { Link } from '@/db/schema/links'
import { SquareArrowOutUpRight, Download } from 'lucide-react'

const AccessResourcesView = ({
  files,
  links,
}: {
  files: File.ClientRecord[]
  links: Link.ClientRecord[]
}) => {
  return (
    <div className="flex flex-col gap-4 w-full px-4">
      {files.length > 0 && (
        <div className="flex flex-col gap-4 w-full px-4">
          <TableHeader
            title={'Files'}
            buttonLabel={'Download All'}
            buttonIcon={<Download size={16} />}
            buttonOnClick={async () => {
              const downloadUrls = files.map((file) => file.cdnUrl)
              if (downloadUrls.length === 0) return

              const zip = new JSZip()

              const downloads = downloadUrls.map(async (url, i) => {
                const response = await fetch(url)
                const blob = await response.blob()
                zip.file(files[i].name, blob)
              })

              await Promise.all(downloads)

              const content = await zip.generateAsync({
                type: 'blob',
              })
              const downloadUrl = URL.createObjectURL(content)

              const link = document.createElement('a')
              link.href = downloadUrl
              link.download = 'files.zip'
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
              URL.revokeObjectURL(downloadUrl)
            }}
          />
          <div>
            {files.map((file) => (
              <FilePostPurchaseAssetRow
                key={file.id}
                mode="customer"
                file={file}
              />
            ))}
          </div>
        </div>
      )}
      {links.length > 0 && (
        <div className="flex flex-col gap-4 w-full px-4">
          <TableHeader
            title={'Links'}
            buttonLabel={'Open All'}
            buttonIcon={<SquareArrowOutUpRight size={16} />}
            buttonOnClick={() => {
              links.forEach((link) => {
                window.open(link.url, '_blank')
              })
            }}
          />
          <div>
            {links.map((link) => (
              <LinkPostPurchaseAssetRow
                key={link.id}
                mode="customer"
                link={link}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AccessResourcesView
