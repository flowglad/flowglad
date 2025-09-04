'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import Header from '@/components/header'
import Footer from '@/components/footer'
import CodePanel from '@/components/code-panel'
import { motion, useReducedMotion } from 'framer-motion'

export default function Home() {
  const shouldReduceMotion = useReducedMotion()
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="pt-14">
        {' '}
        {/* Account for fixed header */}
        {/* Hero Section */}
        <section className="container py-24 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <motion.div
              className="space-y-6"
              initial={
                shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, y: 20 }
              }
              animate={{ opacity: 1, y: 0 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { duration: 0.5 }
              }
            >
              <motion.h1
                className="text-hero-title font-bold leading-tighter tracking-tighter"
                initial={
                  shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 20 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { duration: 0.5, delay: 0.1 }
                }
              >
                Make internet money
              </motion.h1>
              <motion.p
                className="text-hero-subtitle text-text-secondary max-w-md leading-relaxed"
                initial={
                  shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 20 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { duration: 0.5, delay: 0.2 }
                }
              >
                The easiest way to monetize your app with subscription
                billing, usage tracking, and payment processing.
              </motion.p>
              <motion.div
                className="flex flex-col sm:flex-row gap-4"
                initial={
                  shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 20 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { duration: 0.5, delay: 0.3 }
                }
              >
                <Button
                  size="lg"
                  asChild
                  className="bg-white text-black hover:bg-gray-200 rounded-md"
                >
                  <Link href="/docs">Get Started</Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  asChild
                  className="border-zinc-800 hover:bg-zinc-900 rounded-md"
                >
                  <Link href="/github">View on GitHub</Link>
                </Button>
              </motion.div>
            </motion.div>

            {/* Code Panel - Already has its own animations */}
            <div className="flex justify-center lg:justify-end">
              <CodePanel />
            </div>
          </div>
        </section>
        {/* Features Section with decorative elements */}
        <motion.section
          className="container py-24 relative"
          initial={
            shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }
          }
          animate={{ opacity: 1 }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { duration: 0.5, delay: 0.5 }
          }
        >
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-20 left-20 w-64 h-64 bg-white/5 rounded-full blur-3xl animate-float" />
            <div
              className="absolute bottom-20 right-20 w-96 h-96 bg-white/5 rounded-full blur-3xl animate-float"
              style={{ animationDelay: '2s' }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <motion.div
              className="space-y-4"
              initial={
                shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, y: 20 }
              }
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { duration: 0.5 }
              }
            >
              <h3 className="text-xl font-semibold">
                Built for developers
              </h3>
              <p className="text-text-secondary">
                Clean APIs, comprehensive docs, and SDKs for every
                platform.
              </p>
            </motion.div>
            <motion.div
              className="space-y-4"
              initial={
                shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, y: 20 }
              }
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { duration: 0.5, delay: 0.1 }
              }
            >
              <h3 className="text-xl font-semibold">
                Scale without limits
              </h3>
              <p className="text-text-secondary">
                Handle millions of transactions with enterprise-grade
                infrastructure.
              </p>
            </motion.div>
            <motion.div
              className="space-y-4"
              initial={
                shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, y: 20 }
              }
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { duration: 0.5, delay: 0.2 }
              }
            >
              <h3 className="text-xl font-semibold">
                Usage-based billing
              </h3>
              <p className="text-text-secondary">
                Charge based on actual usage with flexible metering
                and pricing.
              </p>
            </motion.div>
          </div>
        </motion.section>
      </main>
      <Footer />
    </div>
  )
}
