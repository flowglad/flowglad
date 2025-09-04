import Link from 'next/link'
import { Button } from '@/components/ui/button'
import Header from '@/components/header'
import Footer from '@/components/footer'
import { ChevronLeft } from 'lucide-react'

export const metadata = {
  title: 'Privacy Policy - Flowglad',
  description:
    'Flowglad Privacy Policy - How we collect, use, and protect your personal information.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="container py-16">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" asChild className="mb-6">
            <Link href="/" className="flex items-center gap-2">
              <ChevronLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </Button>

          <div className="prose prose-invert prose-lg max-w-none">
            <h1>Privacy Policy</h1>
            <p>
              <strong>Last updated: January 1, 2024</strong>
            </p>

            <p>
              This Privacy Policy describes how Flowglad
              (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or
              &ldquo;us&rdquo;) collects, uses, and shares your
              personal information when you use our website and
              services.
            </p>

            <h2>Information We Collect</h2>

            <h3>Information You Provide</h3>
            <ul>
              <li>
                <strong>Account Information:</strong> Email address,
                name, company information
              </li>
              <li>
                <strong>Payment Information:</strong> Billing address
                and payment method details (processed securely by our
                payment processors)
              </li>
              <li>
                <strong>Communications:</strong> Messages you send to
                us through support channels
              </li>
            </ul>

            <h3>Information We Collect Automatically</h3>
            <ul>
              <li>
                <strong>Usage Data:</strong> How you interact with our
                services, features used, and performance metrics
              </li>
              <li>
                <strong>Device Information:</strong> IP address,
                browser type, operating system
              </li>
              <li>
                <strong>Cookies:</strong> We use cookies and similar
                technologies to improve your experience
              </li>
            </ul>

            <h2>How We Use Your Information</h2>
            <ul>
              <li>Provide and improve our services</li>
              <li>Process payments and billing</li>
              <li>
                Communicate with you about your account and our
                services
              </li>
              <li>Ensure security and prevent fraud</li>
              <li>Comply with legal obligations</li>
            </ul>

            <h2>Information Sharing</h2>
            <p>
              We do not sell or rent your personal information. We may
              share your information with:
            </p>
            <ul>
              <li>
                <strong>Service Providers:</strong> Third-party
                vendors who help us operate our services
              </li>
              <li>
                <strong>Legal Compliance:</strong> When required by
                law or to protect our rights
              </li>
              <li>
                <strong>Business Transfers:</strong> In connection
                with a merger or acquisition
              </li>
            </ul>

            <h2>Data Security</h2>
            <p>
              We implement industry-standard security measures to
              protect your personal information, including encryption,
              secure servers, and access controls.
            </p>

            <h2>Data Retention</h2>
            <p>
              We retain your personal information for as long as
              necessary to provide our services and comply with legal
              obligations.
            </p>

            <h2>Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access and update your personal information</li>
              <li>Delete your account and personal data</li>
              <li>Object to certain processing of your data</li>
              <li>Export your data in a portable format</li>
            </ul>

            <h2>International Data Transfers</h2>
            <p>
              Your information may be processed in countries other
              than where you reside. We ensure appropriate safeguards
              are in place for international transfers.
            </p>

            <h2>Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We
              will notify you of significant changes by email or
              through our services.
            </p>

            <h2>Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, please
              contact us at:
            </p>
            <ul>
              <li>Email: privacy@flowglad.com</li>
              <li>Address: [Company Address]</li>
            </ul>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
