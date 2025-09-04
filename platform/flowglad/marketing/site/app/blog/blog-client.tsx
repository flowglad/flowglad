'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { BlogPost } from '@/lib/blog'

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

interface BlogClientProps {
  blogPosts: BlogPost[]
}

export default function BlogPageClient({
  blogPosts,
}: BlogClientProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div
        className="text-center mb-16"
        initial={
          shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 20 }
        }
        animate={{ opacity: 1, y: 0 }}
        transition={
          shouldReduceMotion ? { duration: 0 } : { duration: 0.6 }
        }
      >
        <h1 className="text-4xl lg:text-5xl font-bold mb-4">Blog</h1>
        <p className="text-xl text-muted-foreground">
          Insights, guides, and updates from the Flowglad team
        </p>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {blogPosts.map((post, index) => (
          <motion.div
            key={post.slug}
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: 20 }
            }
            animate={{ opacity: 1, y: 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { duration: 0.6, delay: index * 0.1 }
            }
            whileHover={
              shouldReduceMotion
                ? {}
                : {
                    y: -8,
                    transition: { duration: 0.2 },
                  }
            }
            className="group"
          >
            <Link href={`/blog/${post.slug}`}>
              <Card className="h-full rounded-md bg-card/50 border-border/40 overflow-hidden relative transition-all duration-300 group-hover:shadow-2xl group-hover:shadow-primary/20">
                <GeometricPattern
                  className={`
                    ${index % 3 === 0 ? 'text-blue-500' : ''}
                    ${index % 3 === 1 ? 'text-purple-500' : ''}
                    ${index % 3 === 2 ? 'text-green-500' : ''}
                  `}
                />
                <CardHeader className="relative z-10 pb-4">
                  <div className="text-sm text-muted-foreground mb-3 font-medium">
                    {new Date(post.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                  <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors leading-tight mb-3">
                    {post.title}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground leading-relaxed">
                    {post.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative z-10 pt-0">
                  <div className="text-sm text-muted-foreground font-medium">
                    By {post.author}
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
