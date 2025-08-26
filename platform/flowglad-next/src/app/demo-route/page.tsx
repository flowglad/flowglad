import core from '@/utils/core'
import { notFound } from 'next/navigation'
import { HelloWorld } from '@/registry/new-york/hello-world/hello-world'

const DemoPage = () => {
  if (core.IS_PROD) {
    return notFound()
  }
  return (
    <div>
      <h1>Demo Page</h1>
      <HelloWorld />
    </div>
  )
}

export default DemoPage
