import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { Highlight, themes } from 'prism-react-renderer'
import Header from '@/components/header'
import Footer from '@/components/footer'
import { Button } from '@/components/ui/button'
import { getBlogPost, getAllBlogPosts } from '@/lib/blog'
import remarkGfm from 'remark-gfm'

// Custom code component for syntax highlighting
function CodeBlock(
  props: React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLElement>,
    HTMLElement
  >
) {
  const { children, className } = props
  const language = className?.replace('language-', '') || 'text'

  if (!children || typeof children !== 'string') {
    return <code className={className}>{children}</code>
  }

  return (
    <div className="rounded-lg overflow-hidden my-6">
      <Highlight
        theme={themes.vsDark}
        code={children.trim()}
        language={language}
      >
        {({
          className,
          style,
          tokens,
          getLineProps,
          getTokenProps,
        }) => (
          <pre
            className={`${className} p-4 overflow-x-auto`}
            style={style}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  )
}

const components = {
  code: CodeBlock,
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1
      className="text-4xl font-bold mt-8 mb-4 first:mt-0"
      {...props}
    />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-3xl font-bold mt-8 mb-4" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-2xl font-bold mt-6 mb-3" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-4 leading-7" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-inside mb-4 space-y-2" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol
      className="list-decimal list-inside mb-4 space-y-2"
      {...props}
    />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-4 border-primary pl-4 italic my-6"
      {...props}
    />
  ),
  a: (props: React.HTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-primary hover:underline" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-bold text-foreground" {...props} />
  ),
}

interface Props {
  params: {
    slug: string
  }
}

export function generateStaticParams() {
  const posts = getAllBlogPosts()
  return posts.map((post) => ({
    slug: post.slug,
  }))
}

export function generateMetadata({ params }: Props) {
  const post = getBlogPost(params.slug)

  if (!post) {
    return {
      title: 'Post Not Found',
    }
  }

  return {
    title: post.title,
    description: post.description,
  }
}

export default function BlogPostPage({ params }: Props) {
  const post = getBlogPost(params.slug)

  if (!post) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="container py-16">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Button variant="ghost" asChild className="mb-6">
              <Link href="/blog" className="flex items-center gap-2">
                <ChevronLeft className="h-4 w-4" />
                Back to Blog
              </Link>
            </Button>

            <div className="mb-6">
              <div className="text-sm text-muted-foreground mb-2">
                {new Date(post.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold mb-4">
                {post.title}
              </h1>
              <p className="text-xl text-muted-foreground mb-4">
                {post.description}
              </p>
              <div className="text-sm text-muted-foreground">
                By {post.author}
              </div>
            </div>
          </div>

          <article className="prose prose-invert prose-lg max-w-none">
            <MDXRemote
              source={post.content}
              components={components}
              options={{
                mdxOptions: {
                  remarkPlugins: [remarkGfm],
                },
              }}
            />
          </article>

          <div className="mt-12 pt-8 border-t border-border/40">
            <Button asChild>
              <Link href="/blog">← Back to Blog</Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
