import crypto from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyWebhook, WebhookVerificationError } from './webhook'

// Helper to generate a valid webhook signature
function generateSignature(
  id: string,
  timestamp: string,
  payload: string,
  secret: string
): string {
  const secretBase64 = secret.split('_')[1]
  const secretKey = Buffer.from(secretBase64, 'base64')
  const signedContent = `${id}.${timestamp}.${payload}`
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(signedContent)
    .digest('base64')
  return `v1,${signature}`
}

// Helper to create valid webhook data
function createValidWebhookData(
  payload: object,
  secret: string,
  timestampOffset: number = 0
) {
  const id = 'msg_test123'
  const timestamp = Math.floor(Date.now() / 1000) + timestampOffset
  const payloadString = JSON.stringify(payload)
  const signature = generateSignature(
    id,
    timestamp.toString(),
    payloadString,
    secret
  )

  return {
    id,
    timestamp: timestamp.toString(),
    signature,
    payload: payloadString,
    headers: {
      'svix-id': id,
      'svix-timestamp': timestamp.toString(),
      'svix-signature': signature,
    },
  }
}

describe('verifyWebhook', () => {
  const validSecret =
    'whsec_' +
    Buffer.from('test-secret-key-32-bytes!!').toString('base64')
  const testPayload = { type: 'test.event', data: { foo: 'bar' } }

  describe('Valid signature verification', () => {
    it('verifies valid webhook with string payload, verifies valid webhook with Buffer payload, handles case-insensitive headers, and handles array headers', () => {
      const webhook = createValidWebhookData(testPayload, validSecret)

      // Verifies valid webhook with string payload
      const result1 = verifyWebhook(
        webhook.payload,
        webhook.headers,
        validSecret
      )
      expect(result1).toEqual(testPayload)

      // Verifies valid webhook with Buffer payload
      const result2 = verifyWebhook(
        Buffer.from(webhook.payload, 'utf8'),
        webhook.headers,
        validSecret
      )
      expect(result2).toEqual(testPayload)

      // Handles case-insensitive headers
      const headersCaseInsensitive = {
        'SVIX-ID': webhook.id,
        'SVIX-TIMESTAMP': webhook.timestamp,
        'SVIX-SIGNATURE': webhook.signature,
      }
      const result3 = verifyWebhook(
        webhook.payload,
        headersCaseInsensitive,
        validSecret
      )
      expect(result3).toEqual(testPayload)

      // Handles array headers (takes first element)
      const headersArray = {
        'svix-id': [webhook.id],
        'svix-timestamp': [webhook.timestamp],
        'svix-signature': [webhook.signature],
      }
      const result4 = verifyWebhook(
        webhook.payload,
        headersArray,
        validSecret
      )
      expect(result4).toEqual(testPayload)
    })
  })

  describe('Invalid signature detection', () => {
    it('throws error for invalid signature, wrong secret, malformed signature format, or wrong signature version', () => {
      const webhook = createValidWebhookData(testPayload, validSecret)

      // Invalid signature
      const headersInvalidSig = {
        ...webhook.headers,
        'svix-signature': 'v1,invalid_signature_base64==',
      }
      expect(() => {
        verifyWebhook(webhook.payload, headersInvalidSig, validSecret)
      }).toThrow(/Invalid signature.*provided signature/)

      // Wrong secret
      const wrongSecret =
        'whsec_' +
        Buffer.from('wrong-secret-key-32-bytes!!').toString('base64')
      expect(() => {
        verifyWebhook(webhook.payload, webhook.headers, wrongSecret)
      }).toThrow(/Invalid signature.*provided signature/)

      // Malformed signature format (missing version)
      const headersMalformed = {
        ...webhook.headers,
        'svix-signature': 'invalid_format',
      }
      expect(() => {
        verifyWebhook(webhook.payload, headersMalformed, validSecret)
      }).toThrow(WebhookVerificationError)

      // Wrong signature version
      const headersWrongVersion = {
        ...webhook.headers,
        'svix-signature': 'v2,some_signature==',
      }
      expect(() => {
        verifyWebhook(
          webhook.payload,
          headersWrongVersion,
          validSecret
        )
      }).toThrow(WebhookVerificationError)
    })
  })

  describe('Missing headers handling', () => {
    it('throws error when svix-id is missing, svix-timestamp is missing, svix-signature is missing, or header array is empty', () => {
      const webhook = createValidWebhookData(testPayload, validSecret)

      // svix-id is missing
      const headersMissingId = {
        'svix-timestamp': webhook.timestamp,
        'svix-signature': webhook.signature,
      }
      expect(() => {
        verifyWebhook(webhook.payload, headersMissingId, validSecret)
      }).toThrow('Missing required header: svix-id')

      // svix-timestamp is missing
      const headersMissingTimestamp = {
        'svix-id': webhook.id,
        'svix-signature': webhook.signature,
      }
      expect(() => {
        verifyWebhook(
          webhook.payload,
          headersMissingTimestamp,
          validSecret
        )
      }).toThrow('Missing required header: svix-timestamp')

      // svix-signature is missing
      const headersMissingSignature = {
        'svix-id': webhook.id,
        'svix-timestamp': webhook.timestamp,
      }
      expect(() => {
        verifyWebhook(
          webhook.payload,
          headersMissingSignature,
          validSecret
        )
      }).toThrow('Missing required header: svix-signature')

      // Header array is empty
      const headersEmptyArray = {
        'svix-id': [],
        'svix-timestamp': webhook.timestamp,
        'svix-signature': webhook.signature,
      }
      expect(() => {
        verifyWebhook(webhook.payload, headersEmptyArray, validSecret)
      }).toThrow(WebhookVerificationError)
    })
  })

  describe('Timestamp validation', () => {
    it('accepts webhook within default tolerance, rejects older than default tolerance, uses custom tolerance, rejects older than custom tolerance, disables validation when null, rejects timestamp too far in future, accepts timestamp slightly in future, and throws error for invalid timestamp format', () => {
      // Accepts webhook within default tolerance (299 seconds ago)
      const webhookWithinTolerance = createValidWebhookData(
        testPayload,
        validSecret,
        -299
      )
      const result1 = verifyWebhook(
        webhookWithinTolerance.payload,
        webhookWithinTolerance.headers,
        validSecret
      )
      expect(result1).toEqual(testPayload)

      // Rejects webhook older than default tolerance (301 seconds ago)
      const webhookTooOld = createValidWebhookData(
        testPayload,
        validSecret,
        -301
      )
      expect(() => {
        verifyWebhook(
          webhookTooOld.payload,
          webhookTooOld.headers,
          validSecret
        )
      }).toThrow('Webhook timestamp is too old')

      // Uses custom tolerance when provided (10 minutes ago, 600s tolerance)
      const webhookWithCustomTolerance = createValidWebhookData(
        testPayload,
        validSecret,
        -600
      )
      const result2 = verifyWebhook(
        webhookWithCustomTolerance.payload,
        webhookWithCustomTolerance.headers,
        validSecret,
        600
      )
      expect(result2).toEqual(testPayload)

      // Rejects webhook older than custom tolerance (601 seconds ago, 600s tolerance)
      const webhookOlderThanCustom = createValidWebhookData(
        testPayload,
        validSecret,
        -601
      )
      expect(() => {
        verifyWebhook(
          webhookOlderThanCustom.payload,
          webhookOlderThanCustom.headers,
          validSecret,
          600
        )
      }).toThrow('Webhook timestamp is too old')

      // Disables timestamp validation when null is provided (very old webhook)
      const veryOldWebhook = createValidWebhookData(
        testPayload,
        validSecret,
        -10000
      )
      const result3 = verifyWebhook(
        veryOldWebhook.payload,
        veryOldWebhook.headers,
        validSecret,
        null
      )
      expect(result3).toEqual(testPayload)

      // Rejects timestamp too far in future (clock skew protection, 61 seconds)
      const futureWebhook = createValidWebhookData(
        testPayload,
        validSecret,
        61
      )
      expect(() => {
        verifyWebhook(
          futureWebhook.payload,
          futureWebhook.headers,
          validSecret
        )
      }).toThrow(
        /Webhook timestamp is too far in the future.*Offset: \d+s, max allowed: 60s\. Possible clock skew\./
      )

      // Accepts timestamp slightly in future (within 60 second window, 30 seconds)
      const slightlyFutureWebhook = createValidWebhookData(
        testPayload,
        validSecret,
        30
      )
      const result4 = verifyWebhook(
        slightlyFutureWebhook.payload,
        slightlyFutureWebhook.headers,
        validSecret
      )
      expect(result4).toEqual(testPayload)

      // Throws error for invalid timestamp format (not a number)
      const webhookWithInvalidTimestamp = createValidWebhookData(
        testPayload,
        validSecret
      )
      const headersWithInvalidTimestamp = {
        ...webhookWithInvalidTimestamp.headers,
        'svix-timestamp': 'not-a-number',
      }
      expect(() => {
        verifyWebhook(
          webhookWithInvalidTimestamp.payload,
          headersWithInvalidTimestamp,
          validSecret
        )
      }).toThrow(
        /Invalid timestamp format.*Expected numeric timestamp/
      )
    })
  })

  describe('Invalid secret format', () => {
    it('throws error when secret does not start with whsec_, has no base64 part, or has invalid base64', () => {
      const webhook = createValidWebhookData(testPayload, validSecret)

      // Secret does not start with whsec_
      expect(() => {
        verifyWebhook(
          webhook.payload,
          webhook.headers,
          'invalid_secret'
        )
      }).toThrow('Invalid secret format. Must start with whsec_')

      // Secret has no base64 part
      expect(() => {
        verifyWebhook(webhook.payload, webhook.headers, 'whsec_')
      }).toThrow(/Invalid secret format.*base64-encoded key/)

      // Secret base64 is invalid
      expect(() => {
        verifyWebhook(
          webhook.payload,
          webhook.headers,
          'whsec_invalid!@#'
        )
      }).toThrow(
        'Invalid secret format. Secret must be base64 encoded'
      )
    })
  })

  describe('Multiple signatures support', () => {
    it('accepts webhook when any signature matches or rejects webhook when no signatures match', () => {
      const webhook = createValidWebhookData(testPayload, validSecret)
      const wrongSecret =
        'whsec_' +
        Buffer.from('wrong-secret-key-32-bytes!!').toString('base64')

      // Accepts webhook when any signature matches
      const wrongSignature = generateSignature(
        webhook.id,
        webhook.timestamp,
        webhook.payload,
        wrongSecret
      )
      const headersWithValidSig = {
        ...webhook.headers,
        'svix-signature': `${wrongSignature} ${webhook.signature}`,
      }
      const result = verifyWebhook(
        webhook.payload,
        headersWithValidSig,
        validSecret
      )
      expect(result).toEqual(testPayload)

      // Rejects webhook when no signatures match
      const wrongSignature1 = generateSignature(
        webhook.id,
        webhook.timestamp,
        webhook.payload,
        wrongSecret
      )
      const wrongSignature2 = 'v1,another_wrong_signature=='
      const headersWithNoValidSig = {
        ...webhook.headers,
        'svix-signature': `${wrongSignature1} ${wrongSignature2}`,
      }
      expect(() => {
        verifyWebhook(
          webhook.payload,
          headersWithNoValidSig,
          validSecret
        )
      }).toThrow(WebhookVerificationError)
    })
  })

  describe('Invalid JSON payload', () => {
    it('throws error for invalid JSON', () => {
      const invalidPayload = '{ invalid json }'
      const webhook = createValidWebhookData({}, validSecret)
      webhook.payload = invalidPayload
      webhook.signature = generateSignature(
        webhook.id,
        webhook.timestamp,
        invalidPayload,
        validSecret
      )
      webhook.headers['svix-signature'] = webhook.signature

      expect(() => {
        verifyWebhook(webhook.payload, webhook.headers, validSecret)
      }).toThrow(/Invalid JSON payload.*Failed to parse/)
    })

    it('throws error for empty payload', () => {
      const emptyPayload = ''
      const webhook = createValidWebhookData({}, validSecret)
      webhook.payload = emptyPayload
      webhook.signature = generateSignature(
        webhook.id,
        webhook.timestamp,
        emptyPayload,
        validSecret
      )
      webhook.headers['svix-signature'] = webhook.signature

      expect(() => {
        verifyWebhook(webhook.payload, webhook.headers, validSecret)
      }).toThrow(WebhookVerificationError)
    })
  })

  describe('Edge cases', () => {
    it('handles empty headers object, undefined header values, signature with invalid base64, wrong length, or whitespace in signature header', () => {
      const webhook = createValidWebhookData(testPayload, validSecret)

      // 1. Empty headers object
      expect(() => {
        verifyWebhook(webhook.payload, {}, validSecret)
      }).toThrow(WebhookVerificationError)

      // 2. Undefined header values
      const headersWithUndefined = {
        'svix-id': undefined,
        'svix-timestamp': webhook.timestamp,
        'svix-signature': webhook.signature,
      }
      expect(() => {
        verifyWebhook(
          webhook.payload,
          headersWithUndefined,
          validSecret
        )
      }).toThrow(WebhookVerificationError)

      // 3. Signature with invalid base64
      const headersWithInvalidBase64 = {
        ...webhook.headers,
        'svix-signature': 'v1,invalid!@#base64==',
      }
      expect(() => {
        verifyWebhook(
          webhook.payload,
          headersWithInvalidBase64,
          validSecret
        )
      }).toThrow(WebhookVerificationError)

      // 4. Signature with wrong length (timing-safe comparison)
      const shortSig = 'v1,' + Buffer.from('short').toString('base64')
      const headersWithShortSig = {
        ...webhook.headers,
        'svix-signature': shortSig,
      }
      expect(() => {
        verifyWebhook(
          webhook.payload,
          headersWithShortSig,
          validSecret
        )
      }).toThrow(WebhookVerificationError)

      // 5. Whitespace in signature header (should still work)
      const headersWithWhitespace = {
        ...webhook.headers,
        'svix-signature': `  ${webhook.signature}  `,
      }
      const result = verifyWebhook(
        webhook.payload,
        headersWithWhitespace,
        validSecret
      )
      expect(result).toEqual(testPayload)
    })
  })
})
