import axios from 'axios'
import core from './core'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PutObjectCommand, S3 } from '@aws-sdk/client-s3'

const cloudflareAccountID = core.envVariable('CLOUDFLARE_ACCOUNT_ID')
const cloudflareAccessKeyID = core.envVariable(
  'CLOUDFLARE_ACCESS_KEY_ID'
)
const cloudflareSecretAccessKey = core.envVariable(
  'CLOUDFLARE_SECRET_ACCESS_KEY'
)

const cloudflareBucket = core.envVariable('CLOUDFLARE_R2_BUCKET')

const s3 = new S3({
  endpoint: `https://${cloudflareAccountID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: cloudflareAccessKeyID,
    secretAccessKey: cloudflareSecretAccessKey,
  },
})

interface PutFileParams {
  body: Buffer | string
  key: string
  contentType: string
}

const putFile = async ({ body, key, contentType }: PutFileParams) => {
  const s3Params = {
    Bucket: cloudflareBucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }
  await s3.putObject(s3Params)
}

interface PutImageParams {
  imageURL: string
  key: string
}

const putImage = async ({ imageURL, key }: PutImageParams) => {
  try {
    const response = await axios.get(imageURL, {
      responseType: 'arraybuffer',
    })
    await putFile({
      body: response.data,
      key,
      contentType: response.headers['content-type'],
    })
    const uploadedImageURL = `https://${cloudflareBucket}.com/${key}`
    return uploadedImageURL
  } catch (error) {
    const errorMessage = `Failed to save the image from ${imageURL} to R2. Error: ${error}`
    console.error(errorMessage)
    throw Error(errorMessage)
  }
}

interface PutCsvParams {
  body: string
  key: string
}

const putCsv = async ({ body, key }: PutCsvParams) => {
  try {
    await putFile({ body, key, contentType: 'text/csv' })
  } catch (error) {
    const errorMessage = `Failed to save the CSV to R2. Key: ${key}. Error: ${error}`
    console.error(errorMessage)
    throw Error(errorMessage)
  }
}

const putPDF = async ({
  body,
  key,
}: {
  body: Buffer
  key: string
}) => {
  try {
    await putFile({ body, key, contentType: 'application/pdf' })
  } catch (error) {
    const errorMessage = `Failed to save the PDF to R2. Key: ${key}. Error: ${error}`
    console.error(errorMessage)
    throw Error(errorMessage)
  }
}

interface PresignedURLParams {
  directory: string
  key: string
  contentType: string
  organizationId: string
}

const getPresignedURL = async ({
  directory,
  key,
  contentType,
  organizationId,
}: PresignedURLParams) => {
  const keyWithOrganizationNamespace = organizationId
    ? `${organizationId}/${directory}/${key}`
    : `${directory}/${key}`
  const presignedURL = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: cloudflareBucket,
      ContentType: contentType,
      Key: keyWithOrganizationNamespace,
    }),
    {
      expiresIn: 60 * 60 * 24 * 7,
    }
  )
  const publicURL = core.safeUrl(
    keyWithOrganizationNamespace,
    cloudflareMethods.BUCKET_PUBLIC_URL
  )

  return {
    objectKey: keyWithOrganizationNamespace,
    presignedURL,
    publicURL,
  }
}

const SCREENSHOT_DIRECTORY = 'screenshots/'

const screenshotKeyFromContentAddress = (contentAddress: string) => {
  const dedupedScreenshotDirectory = contentAddress.startsWith(
    SCREENSHOT_DIRECTORY
  )
    ? contentAddress
    : `${SCREENSHOT_DIRECTORY}${contentAddress}`
  const dedupedFileEnding = contentAddress.endsWith('.png')
    ? ''
    : '.png'
  return `${dedupedScreenshotDirectory}${dedupedFileEnding}`
}

const BUCKET_PUBLIC_URL = process.env.NEXT_PUBLIC_CDN_URL as string

const screenshotURLFromContentAddress = (contentAddress: string) => {
  return new URL(
    screenshotKeyFromContentAddress(contentAddress),
    BUCKET_PUBLIC_URL
  ).href
}

/**
 * used to determine whether the file is a designer file and if so,
 * the designer id - a kind of permissions check for the file
 */
const getDesignerIdFromUrl = (url: string): number | null => {
  const parsedUrl = new URL(url)
  const pathParts = parsedUrl.pathname.split('/')
  const designerPart = pathParts[1]?.startsWith('designer_')
    ? pathParts[1]
    : undefined

  if (designerPart) {
    const designerId = parseInt(designerPart.split('_')[1], 10)
    return isNaN(designerId) ? null : designerId
  }

  return null
}

const deleteObject = async (key: string): Promise<void> => {
  try {
    await s3.deleteObject({
      Bucket: cloudflareBucket,
      Key: key,
    })
  } catch (error) {
    console.error(
      `Failed to delete object with key: ${key}. Error: ${error}`
    )
    throw new Error(`Failed to delete object from R2: ${error}`)
  }
}

const getObject = async (key: string) => {
  try {
    const response = await s3.getObject({
      Bucket: cloudflareBucket,
      Key: key,
    })
    return response
  } catch (error) {
    console.error(
      `Failed to get object with key: ${key}. Error: ${error}`
    )
    throw new Error(`Failed to get object from R2: ${error}`)
  }
}

export const getHeadObject = async (key: string) => {
  const response = await s3.headObject({
    Bucket: cloudflareBucket,
    Key: key,
  })
  return response
}

const keyFromCDNUrl = (cdnUrl: string) => {
  const parsedUrl = new URL(cdnUrl)
  const pathParts = parsedUrl.pathname.split('/')
  const key = pathParts[pathParts.length - 1]
  return key
}

const cloudflareMethods = {
  screenshotKeyFromContentAddress,
  getPresignedURL,
  putImage,
  putPDF,
  putCsv,
  keyFromCDNUrl,
  screenshotURLFromContentAddress,
  BUCKET_PUBLIC_URL,
  getDesignerIdFromUrl,
  deleteObject,
  getObject,
}

export default cloudflareMethods
