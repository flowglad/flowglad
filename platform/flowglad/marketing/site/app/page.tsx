'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import Header from '@/components/header'
import Footer from '@/components/footer'
import CodePanel from '@/components/code-panel'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Check,
  Code,
  Zap,
  Shield,
  Gauge,
  Clock,
  RefreshCw,
  DollarSign,
  CreditCard,
  FileText,
  Users,
  Settings,
  ArrowRight,
  Star,
  GitBranch,
  Database,
  Globe,
} from 'lucide-react'

export default function Home() {
  const shouldReduceMotion = useReducedMotion()

  const fadeInUp = {
    initial: shouldReduceMotion
      ? { opacity: 1 }
      : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: shouldReduceMotion
      ? { duration: 0 }
      : { duration: 0.5 },
  }

  const staggerContainer = {
    animate: {
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="pt-14">
        {/* Hero Section */}
        <section className="container py-24 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <motion.div
              className="space-y-6"
              initial={fadeInUp.initial}
              animate={fadeInUp.animate}
              transition={fadeInUp.transition}
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
                Bring your product's monetization vision to life with
                Flowglad's open source ecosystem.
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
                  <Link href="/docs">Read Docs</Link>
                </Button>
              </motion.div>

              {/* Feature Pills */}
              <motion.div
                className="flex flex-wrap gap-3 pt-4"
                initial={
                  shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 20 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { duration: 0.5, delay: 0.4 }
                }
              >
                <span className="px-3 py-1 bg-zinc-900 text-zinc-300 text-sm rounded-full border border-zinc-800">
                  Open Source
                </span>
                <span className="px-3 py-1 bg-zinc-900 text-zinc-300 text-sm rounded-full border border-zinc-800">
                  TypeScript-first
                </span>
                <span className="px-3 py-1 bg-zinc-900 text-zinc-300 text-sm rounded-full border border-zinc-800">
                  Supabase Native
                </span>
              </motion.div>
            </motion.div>

            {/* Code Panel - Already has its own animations */}
            <div className="flex justify-center lg:justify-end">
              <CodePanel />
            </div>
          </div>
        </section>

        {/* Product-led monetization engine */}
        <motion.section
          className="container py-24 border-t border-zinc-800"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              className="space-y-6"
              initial={
                shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, x: -20 }
              }
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-section-title font-bold leading-tighter">
                Your product-led monetization engine
              </h2>
              <p className="text-xl text-text-secondary leading-relaxed">
                Flowglad is a Supabase-native commerce platform for
                digital products
              </p>
            </motion.div>

            <motion.div
              className="bg-[#0d0d0d] border border-zinc-800 rounded-xl p-6"
              initial={
                shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, x: 20 }
              }
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="space-y-3">
                <div className="text-sm text-zinc-400 font-mono">
                  app/api/flowglad/route.ts
                </div>
                <div className="bg-zinc-900/50 p-4 rounded-lg font-mono text-sm">
                  <div className="text-purple-400">import</div>{' '}
                  <div className="text-yellow-400">
                    {'{ createRouteHandler }'}
                  </div>{' '}
                  <div className="text-purple-400">from</div>{' '}
                  <div className="text-green-400">
                    "@flowglad/nextjs"
                  </div>
                  <br />
                  <br />
                  <div className="text-purple-400">export</div>{' '}
                  <div className="text-blue-400">const</div>{' '}
                  <div className="text-white">handler</div> ={' '}
                  <div className="text-yellow-400">
                    createRouteHandler
                  </div>
                  ()
                  <br />
                  <div className="text-purple-400">export</div> {'{ '}
                  <div className="text-white">handler</div>{' '}
                  <div className="text-purple-400">as</div>{' '}
                  <div className="text-white">GET</div>,{' '}
                  <div className="text-white">handler</div>{' '}
                  <div className="text-purple-400">as</div>{' '}
                  <div className="text-white">POST</div> {'}'}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.section>

        {/* Process your first payment in 3 minutes */}
        <motion.section
          className="container py-24 border-t border-zinc-800"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="text-center space-y-6 mb-16"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: 20 }
            }
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-section-title font-bold leading-tighter">
              Process your first payment in 3 minutes
            </h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {[
              {
                name: 'Flowglad',
                time: '3 min',
                setup: 'npm install',
                color: 'text-green-400',
              },
              {
                name: 'Stripe',
                time: '2-3 hours',
                setup: 'Complex webhooks',
                color: 'text-orange-400',
              },
              {
                name: 'Paddle',
                time: '1-2 days',
                setup: 'Manual approval',
                color: 'text-red-400',
              },
            ].map((competitor, index) => (
              <motion.div
                key={competitor.name}
                className="bg-surface-elevated border border-zinc-800 rounded-xl p-6 text-center"
                variants={{
                  initial: shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 20 },
                  animate: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <div className="text-xl font-semibold mb-2">
                  {competitor.name}
                </div>
                <div
                  className={`text-2xl font-bold mb-1 ${competitor.color}`}
                >
                  {competitor.time}
                </div>
                <div className="text-text-secondary text-sm">
                  {competitor.setup}
                </div>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            className="bg-surface-elevated border border-zinc-800 rounded-xl p-8 aspect-video flex items-center justify-center"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, scale: 0.95 }
            }
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-center text-text-secondary">
              <div className="w-24 h-24 bg-zinc-800 rounded-lg mx-auto mb-4 flex items-center justify-center">
                <Zap className="w-12 h-12" />
              </div>
              <p>Demo video coming soon</p>
            </div>
          </motion.div>
        </motion.section>

        {/* Full Stack SDK Section */}
        <motion.section
          className="container py-24 border-t border-zinc-800"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="text-center space-y-6 mb-16"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: 20 }
            }
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-section-title font-bold leading-tighter">
              Full Stack SDK
            </h2>
            <div className="flex justify-center items-center gap-12 text-center">
              <div>
                <div className="text-4xl font-bold text-green-400 mb-2">
                  1
                </div>
                <div className="text-text-secondary">License</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-blue-400 mb-2">
                  0
                </div>
                <div className="text-text-secondary">Webhooks</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-purple-400 mb-2">
                  3+
                </div>
                <div className="text-text-secondary">Libraries</div>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {[
              {
                title: 'Next.js',
                icon: <Code className="w-6 h-6" />,
                code: 'npm install @flowglad/nextjs',
              },
              {
                title: 'React',
                icon: <GitBranch className="w-6 h-6" />,
                code: 'npm install @flowglad/react',
              },
              {
                title: 'Supabase',
                icon: <Database className="w-6 h-6" />,
                code: 'Built-in integration',
              },
            ].map((framework, index) => (
              <motion.div
                key={framework.title}
                className="bg-surface-elevated border border-zinc-800 rounded-xl p-6"
                variants={{
                  initial: shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 20 },
                  animate: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  {framework.icon}
                  <h3 className="text-xl font-semibold">
                    {framework.title}
                  </h3>
                </div>
                <div className="bg-zinc-900/50 p-3 rounded-lg font-mono text-sm text-green-400">
                  {framework.code}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* Model revenue how you want */}
        <motion.section
          className="container py-24 border-t border-zinc-800"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="text-center space-y-6 mb-16"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: 20 }
            }
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-section-title font-bold leading-tighter">
              Model revenue how you want
            </h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {[
              {
                title: 'Recurring',
                icon: <RefreshCw className="w-8 h-8 text-blue-400" />,
                description:
                  'Subscription billing with flexible intervals and proration',
              },
              {
                title: 'Usage-based',
                icon: <Gauge className="w-8 h-8 text-green-400" />,
                description:
                  'Charge based on actual usage with flexible metering',
              },
              {
                title: 'Hybrid',
                icon: (
                  <Settings className="w-8 h-8 text-purple-400" />
                ),
                description:
                  'Combine subscriptions with usage-based charges',
              },
              {
                title: 'One-time',
                icon: (
                  <DollarSign className="w-8 h-8 text-orange-400" />
                ),
                description:
                  'Simple one-time payments for digital products',
              },
            ].map((model, index) => (
              <motion.div
                key={model.title}
                className="bg-surface-elevated border border-zinc-800 rounded-xl p-6 text-center hover:border-zinc-700 transition-colors"
                variants={{
                  initial: shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 20 },
                  animate: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <div className="mb-4 flex justify-center">
                  {model.icon}
                </div>
                <h3 className="text-xl font-semibold mb-3">
                  {model.title}
                </h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  {model.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* Built for devs, priced for growth */}
        <motion.section
          className="container py-24 border-t border-zinc-800"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="text-center space-y-6 mb-16"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: 20 }
            }
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-section-title font-bold leading-tighter">
              Built for devs, priced for growth
            </h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 lg:grid-cols-2 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            <motion.div
              className="bg-surface-elevated border border-zinc-800 rounded-xl p-8"
              variants={{
                initial: shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, x: -20 },
                animate: { opacity: 1, x: 0 },
              }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">
                  Flowglad
                </h3>
                <div className="text-4xl font-bold text-green-400">
                  Free
                </div>
                <div className="text-text-secondary">Open source</div>
              </div>
              <ul className="space-y-3">
                {[
                  'No transaction fees',
                  'Open source',
                  'Self-hosted',
                  'Full customization',
                  'Direct Stripe integration',
                ].map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                    <span className="text-text-secondary">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              className="bg-surface-elevated border border-zinc-800 rounded-xl p-8"
              variants={{
                initial: shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, x: 20 },
                animate: { opacity: 1, x: 0 },
              }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-text-secondary mb-2">
                  Stripe
                </h3>
                <div className="text-4xl font-bold text-orange-400">
                  2.9%
                </div>
                <div className="text-text-secondary">
                  + 30¢ per transaction
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  'Transaction fees',
                  'Closed source',
                  'SaaS platform',
                  'Limited customization',
                  'Vendor lock-in',
                ].map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <div className="w-5 h-5 border border-zinc-600 rounded flex-shrink-0" />
                    <span className="text-text-secondary">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        </motion.section>

        {/* Developer Experience Section */}
        <motion.section
          className="container py-24 border-t border-zinc-800"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="text-center space-y-6 mb-16"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: 20 }
            }
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-section-title font-bold leading-tighter">
              Developer Experience
            </h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {[
              {
                title: 'TypeScript-first',
                icon: <Code className="w-6 h-6 text-blue-400" />,
                description: 'Full type safety from client to server',
              },
              {
                title: 'Integrated payments',
                icon: (
                  <CreditCard className="w-6 h-6 text-green-400" />
                ),
                description:
                  'Built-in Stripe integration with webhooks',
              },
              {
                title: 'Real-time sync',
                icon: <Zap className="w-6 h-6 text-yellow-400" />,
                description: 'Automatic subscription and usage sync',
              },
              {
                title: 'Secure by default',
                icon: <Shield className="w-6 h-6 text-red-400" />,
                description: 'Row-level security with Supabase',
              },
              {
                title: 'Fast development',
                icon: <Clock className="w-6 h-6 text-purple-400" />,
                description: 'Go from idea to payment in minutes',
              },
              {
                title: 'Global scale',
                icon: <Globe className="w-6 h-6 text-indigo-400" />,
                description: 'Built on proven infrastructure',
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                className="bg-surface-elevated border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors"
                variants={{
                  initial: shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 20 },
                  animate: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  {feature.icon}
                  <h3 className="text-lg font-semibold">
                    {feature.title}
                  </h3>
                </div>
                <p className="text-text-secondary text-sm leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* Core Platform Section */}
        <motion.section
          className="container py-24 border-t border-zinc-800"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="text-center space-y-6 mb-16"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: 20 }
            }
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-section-title font-bold leading-tighter">
              Core Platform
            </h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            <motion.div
              className="space-y-4"
              variants={{
                initial: shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, x: -20 },
                animate: { opacity: 1, x: 0 },
              }}
              transition={{ duration: 0.5 }}
            >
              {[
                'Subscription management',
                'Usage tracking and metering',
                'Customer portal',
                'Webhook handling',
                'Tax calculation',
                'Dunning management',
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <span className="text-lg">{feature}</span>
                </div>
              ))}
            </motion.div>

            <motion.div
              className="space-y-4"
              variants={{
                initial: shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, x: 20 },
                animate: { opacity: 1, x: 0 },
              }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              {[
                'Multi-currency support',
                'Revenue recognition',
                'Analytics and reporting',
                'A/B testing for pricing',
                'Team collaboration',
                'Enterprise SSO',
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <span className="text-lg">{feature}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </motion.section>

        {/* Payments and Checkout Section */}
        <motion.section
          className="container py-24 border-t border-zinc-800"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            <motion.div
              className="space-y-6"
              variants={{
                initial: shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, x: -20 },
                animate: { opacity: 1, x: 0 },
              }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-section-title font-bold leading-tighter">
                Payments and Checkout
              </h2>
              <div className="space-y-4">
                <p className="text-xl text-text-secondary leading-relaxed">
                  Seamless payment experience with Stripe Checkout
                  integration
                </p>
                <ul className="space-y-3">
                  {[
                    'Hosted checkout pages',
                    'Payment method management',
                    'Automatic tax calculation',
                    'International payments',
                    'Mobile-optimized flows',
                  ].map((feature, index) => (
                    <li
                      key={index}
                      className="flex items-center gap-3"
                    >
                      <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                      <span className="text-text-secondary">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>

            <motion.div
              className="bg-surface-elevated border border-zinc-800 rounded-xl p-8 text-center"
              variants={{
                initial: shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, x: 20 },
                animate: { opacity: 1, x: 0 },
              }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <CreditCard className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                Secure Payments
              </h3>
              <p className="text-text-secondary">
                PCI DSS compliant with Stripe's world-class security
              </p>
            </motion.div>
          </motion.div>
        </motion.section>

        {/* Billing and Invoicing Section */}
        <motion.section
          className="container py-24 border-t border-zinc-800"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="text-center space-y-6 mb-16"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: 20 }
            }
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-section-title font-bold leading-tighter">
              Billing and Invoicing
            </h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {[
              {
                title: 'Smart Invoicing',
                icon: <FileText className="w-8 h-8 text-blue-400" />,
                description:
                  'Automatic invoice generation with custom branding and line items',
              },
              {
                title: 'Revenue Recognition',
                icon: <Star className="w-8 h-8 text-yellow-400" />,
                description:
                  'Accurate revenue tracking with ASC 606 compliance',
              },
              {
                title: 'Customer Self-Service',
                icon: <Users className="w-8 h-8 text-green-400" />,
                description:
                  'Portal for customers to manage subscriptions and billing',
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                className="bg-surface-elevated border border-zinc-800 rounded-xl p-6 text-center hover:border-zinc-700 transition-colors"
                variants={{
                  initial: shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 20 },
                  animate: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <div className="mb-4 flex justify-center">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold mb-3">
                  {feature.title}
                </h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* Questions Section */}
        <motion.section
          className="container py-24 border-t border-zinc-800"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="text-center space-y-6"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: 20 }
            }
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-section-title font-bold leading-tighter">
              Questions?
            </h2>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed">
              Join our community of developers building the future of
              commerce. Get help, share feedback, and contribute to
              the project.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <Button
                size="lg"
                asChild
                className="bg-white text-black hover:bg-gray-200 rounded-md"
              >
                <Link href="/discord">
                  Join Discord
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                asChild
                className="border-zinc-800 hover:bg-zinc-900 rounded-md"
              >
                <Link href="/github">
                  View on GitHub
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </motion.section>
      </main>
      <Footer />
    </div>
  )
}
