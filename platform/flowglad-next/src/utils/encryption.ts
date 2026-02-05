import crypto from 'crypto'
import { panic } from '@/errors'
import core from '@/utils/core'

// Constants for encryption configuration
const ENCRYPTION_ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM recommended IV length
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 16
// Key derivation iterations (adjust based on security vs performance needs)
const ITERATIONS = 100000
const KEY_LENGTH = 32 // for AES-256

interface EncryptedData {
  encrypted: string // Base64 encoded encrypted data
  iv: string // Base64 encoded initialization vector
  authTag: string // Base64 encoded authentication tag
  salt: string // Base64 encoded salt
}

/**
 * Encrypts sensitive data using AES-256-GCM with key derivation
 * Returns a string containing all components needed for decryption
 */
export function encrypt(plaintext: string): string {
  if (!core.envVariable('ENCRYPTION_KEY')) {
    panic('ENCRYPTION_KEY environment variable not set')
  }

  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH)
  const iv = crypto.randomBytes(IV_LENGTH)

  // Derive key using PBKDF2
  const key = crypto.pbkdf2Sync(
    core.envVariable('ENCRYPTION_KEY'),
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha256'
  )

  // Create cipher
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv)

  // Encrypt the data
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  // Get auth tag
  const authTag = cipher.getAuthTag()

  // Combine all components into a single object
  const encryptedData: EncryptedData = {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
  }

  // Return as a single string
  return JSON.stringify(encryptedData)
}

/**
 * Decrypts data encrypted by the encrypt function
 */
export function decrypt(encryptedString: string): string {
  if (!core.envVariable('ENCRYPTION_KEY')) {
    panic('ENCRYPTION_KEY environment variable not set')
  }

  // Parse the encrypted data
  const encryptedData: EncryptedData = JSON.parse(encryptedString)

  // Convert base64 strings back to buffers
  const encrypted = Buffer.from(encryptedData.encrypted, 'base64')
  const iv = Buffer.from(encryptedData.iv, 'base64')
  const authTag = Buffer.from(encryptedData.authTag, 'base64')
  const salt = Buffer.from(encryptedData.salt, 'base64')

  // Derive the same key
  const key = crypto.pbkdf2Sync(
    core.envVariable('ENCRYPTION_KEY'),
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha256'
  )

  // Create decipher
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    iv
  )
  decipher.setAuthTag(authTag)

  // Decrypt the data
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}
