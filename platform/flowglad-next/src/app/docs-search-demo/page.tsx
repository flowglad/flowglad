import core from '@/utils/core'
import { notFound } from 'next/navigation'
import InternalDocsSearchDemoPage from './InternalDocsSearchDemoPage'

const DocsSearchDemoPage = () => {
  if (core.IS_PROD) {
    return notFound()
  }
  return <InternalDocsSearchDemoPage />
}

export default DocsSearchDemoPage
