import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import Header from '@/components/header'
import Footer from '@/components/footer'
import { getAllBlogPosts } from '@/lib/blog'

// Geometric pattern component for cards
function GeometricPattern({ className }: { className?: string }) {
  return (
    <div className={`absolute inset-0 opacity-10 ${className}`}>
      <svg
        className="w-full h-full"
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="geometric"
            patternUnits="userSpaceOnUse"
            width="20"
            height="20"
          >
            <path
              d="M 10,0 L 20,10 L 10,20 L 0,10 Z"
              fill="currentColor"
            />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#geometric)" />
      </svg>
    </div>
  )
}

export default function BlogPage() {
  const blogPosts = getAllBlogPosts()

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="container py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl lg:text-5xl font-bold mb-4">
              Blog
            </h1>
            <p className="text-xl text-muted-foreground">
              Insights, guides, and updates from the Flowglad team
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {blogPosts.map((post, index) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group"
              >
                <Card className="h-full transition-all duration-300 group-hover:scale-105 group-hover:shadow-2xl bg-card/50 border-border/40 overflow-hidden relative">
                  <GeometricPattern
                    className={`
                    ${index % 3 === 0 ? 'text-blue-500' : ''}
                    ${index % 3 === 1 ? 'text-purple-500' : ''}
                    ${index % 3 === 2 ? 'text-green-500' : ''}
                  `}
                  />
                  <CardHeader className="relative z-10">
                    <div className="text-sm text-muted-foreground mb-2">
                      {new Date(post.date).toLocaleDateString(
                        'en-US',
                        {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        }
                      )}
                    </div>
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">
                      {post.title}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      {post.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    <div className="text-sm text-muted-foreground">
                      By {post.author}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
