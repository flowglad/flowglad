import { BODY_FONT_FAMILY, HEADING_FONT_FAMILY } from './fontStyles'

export const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: BODY_FONT_FAMILY,
}

export const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
}

export const logo = {
  margin: '0 auto',
  marginBottom: '32px',
}

export const h1 = {
  color: '#32325d',
  fontSize: '24px',
  fontWeight: 'normal',
  fontFamily: HEADING_FONT_FAMILY,
  textAlign: 'center' as const,
  margin: '30px 0',
}

export const text = {
  color: '#525f7f',
  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'center' as const,
}

export const details = {
  backgroundColor: '#f6f9fc',
  borderRadius: '4px',
  marginTop: '30px',
  padding: '24px',
}

export const detailsText = {
  color: '#525f7f',
  fontSize: '14px',
  marginBottom: '4px',
}

export const detailsValue = {
  color: '#32325d',
  fontSize: '16px',
  fontWeight: 'bold',
  marginBottom: '16px',
}

export const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '32px',
}

export const footerText = {
  color: '#525f7f',
  fontSize: '14px',
  lineHeight: '20px',
  textAlign: 'center' as const,
  marginTop: '24px',
}
