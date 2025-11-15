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

const BUCKET_PUBLIC_URL = process.env.NEXT_PUBLIC_CDN_URL as string

export const deleteObject = async (key: string): Promise<void> => {
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

export const getObject = async (key: string) => {
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
  try {
    await putFile({ body, key, contentType: 'text/plain' })
  } catch (error) {
    const errorMessage = `Failed to save the text to R2. Key: ${key}. Error: ${error}`
    console.error(errorMessage)
    throw Error(errorMessage)
  }
}

export const putCodebaseMarkdown = async ({
  organizationId,
  markdown,
}: {
  organizationId: string
  markdown: string
}) => {
  const key = `${organizationId}/codebase.md`
  await putTextFile({ body: markdown, key })
}

export const putPricingModelIntegrationGuideMarkdown = async ({
  organizationId,
  pricingModelId,
  markdown,
}: {
  organizationId: string
  pricingModelId: string
  markdown: string
}) => {
  const key = `${organizationId}/pricing-models/${pricingModelId}/integration-guide.md`
  await putTextFile({ body: markdown, key })
}

const cloudflareMethods = {
  getPresignedURL,
  putImage,
  putPDF,
  putCsv,
  putCodebaseMarkdown,
  putPricingModelIntegrationGuideMarkdown,
  keyFromCDNUrl,
  BUCKET_PUBLIC_URL,
  deleteObject,
  getObject,
}

export default cloudflareMethods
