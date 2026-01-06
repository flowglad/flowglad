import { PutObjectCommand, S3 } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { SpanKind } from '@opentelemetry/api'
import axios from 'axios'
import { createHmac } from 'crypto'
import core from './core'
import { withSpan } from './tracing'

const withR2Span = async <T>(
  operation: string,
  attributes: Record<string, string | number | boolean | undefined>,
  fn: () => Promise<T>
): Promise<T> => {
  return withSpan(
    {
      spanName: `r2.${operation}`,
      tracerName: 'cloudflare.r2',
      kind: SpanKind.CLIENT,
      attributes: {
        'r2.operation': operation,
        ...attributes,
      },
    },
    fn
  )
}

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
  return withR2Span(
    'putObject',
    {
      'r2.key': key,
      'r2.content_type': contentType,
      'r2.size_bytes':
        typeof body === 'string'
          ? Buffer.byteLength(body, 'utf8')
          : body.byteLength,
    },
    async () => {
      const s3Params = {
        Bucket: cloudflareBucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }
      await s3.putObject(s3Params)
    }
  )
}

interface PutImageParams {
  imageURL: string
  key: string
}

const putImage = async ({ imageURL, key }: PutImageParams) => {
  return withR2Span('putImage', { 'r2.key': key }, async () => {
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
  })
}

interface PutCsvParams {
  body: string
  key: string
}

const putCsv = async ({ body, key }: PutCsvParams) => {
  return withR2Span('putCsv', { 'r2.key': key }, async () => {
    try {
      await putFile({ body, key, contentType: 'text/csv' })
    } catch (error) {
      const errorMessage = `Failed to save the CSV to R2. Key: ${key}. Error: ${error}`
      console.error(errorMessage)
      throw Error(errorMessage)
    }
  })
}

const putPDF = async ({
  body,
  key,
}: {
  body: Buffer
  key: string
}) => {
  return withR2Span(
    'putPdf',
    { 'r2.key': key, 'r2.size_bytes': body.byteLength },
    async () => {
      try {
        await putFile({ body, key, contentType: 'application/pdf' })
      } catch (error) {
        const errorMessage = `Failed to save the PDF to R2. Key: ${key}. Error: ${error}`
        console.error(errorMessage)
        throw Error(errorMessage)
      }
    }
  )
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
  return withR2Span(
    'getPresignedUrl',
    {
      'r2.key': keyWithOrganizationNamespace,
      'r2.directory': directory,
    },
    async () => {
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
  )
}

const BUCKET_PUBLIC_URL = process.env.NEXT_PUBLIC_CDN_URL as string

export const deleteObject = async (key: string): Promise<void> => {
  return withR2Span('deleteObject', { 'r2.key': key }, async () => {
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
  })
}

export const getObject = async (key: string) => {
  return withR2Span('getObject', { 'r2.key': key }, async () => {
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
  })
}

export const getHeadObject = async (key: string) => {
  return withR2Span('headObject', { 'r2.key': key }, async () => {
    const response = await s3.headObject({
      Bucket: cloudflareBucket,
      Key: key,
    })
    return response
  })
}

export const keyFromCDNUrl = (cdnUrl: string) => {
  const parsedUrl = new URL(cdnUrl)
  const pathParts = parsedUrl.pathname.split('/')
  const key = pathParts[pathParts.length - 1]
  return key
}

const putTextFile = async ({
  body,
  key,
}: {
  body: string
  key: string
}) => {
  return withR2Span('putText', { 'r2.key': key }, async () => {
    try {
      await putFile({ body, key, contentType: 'text/plain' })
    } catch (error) {
      const errorMessage = `Failed to save the text to R2. Key: ${key}. Error: ${error}`
      console.error(errorMessage)
      throw Error(errorMessage)
    }
  })
}

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

/**
 * Stores markdown content in Cloudflare R2 with a hashed key
 * Returns the content hash for storage/retrieval purposes
 */
export const putMarkdownFile = async ({
  organizationId,
  key,
  markdown,
}: {
  organizationId: string
  key: string
  markdown: string
}): Promise<void> => {
  const fullKey = `${organizationId}/${key}`
  return withR2Span(
    'putMarkdown',
    { 'r2.key': fullKey, 'r2.org_id': organizationId },
    async () => {
      await putTextFile({ body: markdown, key: fullKey })
    }
  )
}

/**
 * Retrieves markdown content from Cloudflare R2 by key
 */
export const getMarkdownFile = async ({
  organizationId,
  key,
}: {
  organizationId: string
  key: string
}): Promise<string | null> => {
  const fullKey = `${organizationId}/${key}`
  return withR2Span(
    'getMarkdown',
    { 'r2.key': fullKey, 'r2.org_id': organizationId },
    async () => {
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
  )
}

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
