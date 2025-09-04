import ReactMarkdown from 'react-markdown'

const components = {
  // Override default elements
  h1: (props: any) => (
    <h1
      className="text-2xl font-bold text-primary-foreground-hover py-2"
      {...props}
    />
  ),
  h2: (props: any) => (
    <h2
      className="text-xl font-semibold text-primary-foreground-hover py-2"
      {...props}
    />
  ),
  h3: (props: any) => (
    <h3
      className="text-lg font-semibold text-primary-foreground-hover py-2"
      {...props}
    />
  ),
  p: (props: any) => (
    <p
      className="text-base font-medium text-foreground py-2"
      {...props}
    />
  ),
  ul: (props: any) => (
    <ul
      className="list-disc list-inside text-base font-medium text-foreground py-2"
      {...props}
    />
  ),
  li: (props: any) => (
    <li
      className="text-base font-medium text-foreground py-2"
      {...props}
    />
  ),
}

interface MarkdownContentProps {
  source: string
  title?: string
}

const CheckoutMarkdownView = ({
  source,
  title,
}: MarkdownContentProps) => {
  if (!source) {
    return null
  }

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-primary-foreground-hover py-2">
        {title}
      </h1>
      <ReactMarkdown components={components}>{source}</ReactMarkdown>
    </div>
  )
}

export default CheckoutMarkdownView
