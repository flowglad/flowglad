import { PutObjectCommand, S3 } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import axios from 'axios'
import { createHmac } from 'crypto'
import core from './core'
import { r2Traced } from './tracing'

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

/**
 * Core putFile logic without tracing.
 */
const putFileCore = async ({
  body,
  key,
  contentType,
}: PutFileParams): Promise<void> => {
  const s3Params = {
    Bucket: cloudflareBucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }
  await s3.putObject(s3Params)
}

const putFile = r2Traced(
  'putObject',
  ({ body, key, contentType }: PutFileParams) => ({
    'r2.key': key,
    'r2.content_type': contentType,
    'r2.size_bytes':
      typeof body === 'string'
        ? Buffer.byteLength(body, 'utf8')
        : body.byteLength,
  }),
  putFileCore
)

interface PutImageParams {
  imageURL: string
  key: string
}

/**
 * Core putImage logic without tracing.
 */
const putImageCore = async ({
  imageURL,
  key,
}: PutImageParams): Promise<string> => {
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

const putImage = r2Traced(
  'putImage',
  ({ key }: PutImageParams) => ({ 'r2.key': key }),
  putImageCore
)

interface PutCsvParams {
  body: string
  key: string
}

/**
 * Core putCsv logic without tracing.
 */
const putCsvCore = async ({
  body,
  key,
}: PutCsvParams): Promise<void> => {
  try {
    await putFile({ body, key, contentType: 'text/csv' })
  } catch (error) {
    const errorMessage = `Failed to save the CSV to R2. Key: ${key}. Error: ${error}`
    console.error(errorMessage)
    throw Error(errorMessage)
  }
}

const putCsv = r2Traced(
  'putCsv',
  ({ key }: PutCsvParams) => ({ 'r2.key': key }),
  putCsvCore
)

interface PutPdfParams {
  body: Buffer
  key: string
}

/**
 * Core putPDF logic without tracing.
 */
const putPDFCore = async ({
  body,
  key,
}: PutPdfParams): Promise<void> => {
  try {
    await putFile({ body, key, contentType: 'application/pdf' })
  } catch (error) {
    const errorMessage = `Failed to save the PDF to R2. Key: ${key}. Error: ${error}`
    console.error(errorMessage)
    throw Error(errorMessage)
  }
}

const putPDF = r2Traced(
  'putPdf',
  ({ body, key }: PutPdfParams) => ({
    'r2.key': key,
    'r2.size_bytes': body.byteLength,
  }),
  putPDFCore
)

interface PresignedURLParams {
  directory: string
  key: string
  contentType: string
  organizationId: string
}

/**
 * Core getPresignedURL logic without tracing.
 */
const getPresignedURLCore = async ({
  directory,
  key,
  contentType,
  organizationId,
}: PresignedURLParams): Promise<{
  objectKey: string
  presignedURL: string
  publicURL: string
}> => {
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

const getPresignedURL = r2Traced(
  'getPresignedUrl',
  ({ directory, key, organizationId }: PresignedURLParams) => {
    const keyWithOrganizationNamespace = organizationId
      ? `${organizationId}/${directory}/${key}`
      : `${directory}/${key}`
    return {
      'r2.key': keyWithOrganizationNamespace,
      'r2.directory': directory,
    }
  },
  getPresignedURLCore
)

const BUCKET_PUBLIC_URL = process.env.NEXT_PUBLIC_CDN_URL as string

/**
 * Core deleteObject logic without tracing.
 */
const deleteObjectCore = async (key: string): Promise<void> => {
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

export const deleteObject = r2Traced(
  'deleteObject',
  (key: string) => ({ 'r2.key': key }),
  deleteObjectCore
)

/**
 * Core getObject logic without tracing.
 */
const getObjectCore = async (key: string) => {
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

export const getObject = r2Traced(
  'getObject',
  (key: string) => ({ 'r2.key': key }),
  getObjectCore
)

/**
 * Core getHeadObject logic without tracing.
 */
const getHeadObjectCore = async (key: string) => {
  const response = await s3.headObject({
    Bucket: cloudflareBucket,
    Key: key,
  })
  return response
}

export const getHeadObject = r2Traced(
  'headObject',
  (key: string) => ({ 'r2.key': key }),
  getHeadObjectCore
)

export const keyFromCDNUrl = (cdnUrl: string) => {
  const parsedUrl = new URL(cdnUrl)
  const pathParts = parsedUrl.pathname.split('/')
  const key = pathParts[pathParts.length - 1]
  return key
}

interface PutTextFileParams {
  body: string
  key: string
}

/**
 * Core putTextFile logic without tracing.
 */
const putTextFileCore = async ({
  body,
  key,
}: PutTextFileParams): Promise<void> => {
  try {
    await putFile({ body, key, contentType: 'text/plain' })
  } catch (error) {
    const errorMessage = `Failed to save the text to R2. Key: ${key}. Error: ${error}`
    console.error(errorMessage)
    throw Error(errorMessage)
  }
}

const putTextFile = r2Traced(
  'putText',
  ({ key }: PutTextFileParams) => ({ 'r2.key': key }),
  putTextFileCore
)

/**
 * Generates an unguessable hash using the organization's securitySalt
 * Uses HMAC-SHA256 to create a deterministic but unguessable hash
 * The hash can be regenerated when needed (same content + same salt = same hash)
 * but cannot be guessed without knowing both the content and the salt
 */
export const generateContentHash = ({
  content,
  securitySalt,
}: {
  content: string
  securitySalt: string
}): string => {
  return createHmac('sha256', securitySalt)
    .update(content)
    .digest('hex')
}

interface PutMarkdownFileParams {
  organizationId: string
  key: string
  markdown: string
}

/**
 * Core putMarkdownFile logic without tracing.
 */
const putMarkdownFileCore = async ({
  organizationId,
  key,
  markdown,
}: PutMarkdownFileParams): Promise<void> => {
  const fullKey = `${organizationId}/${key}`
  await putTextFile({ body: markdown, key: fullKey })
}

/**
 * Stores markdown content in Cloudflare R2 with a hashed key
 * Returns the content hash for storage/retrieval purposes
 */
export const putMarkdownFile = r2Traced(
  'putMarkdown',
  ({ organizationId, key }: PutMarkdownFileParams) => {
    const fullKey = `${organizationId}/${key}`
    return { 'r2.key': fullKey, 'r2.org_id': organizationId }
  },
  putMarkdownFileCore
)

interface GetMarkdownFileParams {
  organizationId: string
  key: string
}

/**
 * Core getMarkdownFile logic without tracing.
 */
const getMarkdownFileCore = async ({
  organizationId,
  key,
}: GetMarkdownFileParams): Promise<string | null> => {
  const fullKey = `${organizationId}/${key}`
  try {
    // Call s3.getObject directly to preserve AWS error properties for proper error handling
    const response = await s3.getObject({
      Bucket: cloudflareBucket,
      Key: fullKey,
    })
    if (!response.Body) {
      return null
    }
    // AWS SDK v3 returns Body as a Readable stream, need to transform to string
    return await response.Body.transformToString()
  } catch (error: unknown) {
    // Handle missing objects gracefully - return null instead of throwing
    // AWS SDK throws errors with name "NoSuchKey" or statusCode 404 for missing objects
    if (
      error &&
      typeof error === 'object' &&
      ('name' in error ||
        'statusCode' in error ||
        '$metadata' in error)
    ) {
      const awsError = error as {
        name?: string
        statusCode?: number
        $metadata?: { httpStatusCode?: number }
      }
      if (
        awsError.name === 'NoSuchKey' ||
        awsError.name === 'NotFound' ||
        awsError.statusCode === 404 ||
        awsError.$metadata?.httpStatusCode === 404
      ) {
        return null
      }
    }
    // Re-throw unexpected errors
    throw error
  }
}

/**
 * Retrieves markdown content from Cloudflare R2 by key
 */
export const getMarkdownFile = r2Traced(
  'getMarkdown',
  ({ organizationId, key }: GetMarkdownFileParams) => {
    const fullKey = `${organizationId}/${key}`
    return { 'r2.key': fullKey, 'r2.org_id': organizationId }
  },
  getMarkdownFileCore
)

const cloudflareMethods = {
  getPresignedURL,
  putImage,
  putPDF,
  putCsv,
  keyFromCDNUrl,
  BUCKET_PUBLIC_URL,
  deleteObject,
  getObject,
}

export default cloudflareMethods
