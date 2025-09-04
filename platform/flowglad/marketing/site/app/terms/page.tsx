import Link from 'next/link'
import { Button } from '@/components/ui/button'
import Header from '@/components/header'
import Footer from '@/components/footer'
import { ChevronLeft } from 'lucide-react'

export const metadata = {
  title: 'Terms of Service - Flowglad',
  description:
    'Flowglad Terms of Service - The legal terms and conditions for using our services.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="container pt-14 py-16">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" asChild className="mb-6">
            <Link href="/" className="flex items-center gap-2">
              <ChevronLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </Button>

          <div className="prose prose-invert prose-lg max-w-none">
            <h1>Terms of Service</h1>
            <p>
              <strong>Last updated: January 1, 2024</strong>
            </p>

            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your
              use of Flowglad&apos;s website and services. By
              accessing or using our services, you agree to be bound
              by these Terms.
            </p>

            <h2>1. Acceptance of Terms</h2>
            <p>
              By creating an account or using our services, you
              acknowledge that you have read, understood, and agree to
              these Terms and our Privacy Policy.
            </p>

            <h2>2. Description of Service</h2>
            <p>
              Flowglad provides billing and payment processing
              services for software applications, including
              subscription management, usage tracking, and related
              tools.
            </p>

            <h2>3. Account Registration</h2>
            <ul>
              <li>
                You must provide accurate and complete information
              </li>
              <li>
                You are responsible for maintaining the security of
                your account
              </li>
              <li>
                You must be at least 18 years old or have parental
                consent
              </li>
              <li>
                One person or entity may maintain only one account
              </li>
            </ul>

            <h2>4. Acceptable Use</h2>
            <p>You agree not to use our services to:</p>
            <ul>
              <li>Violate any laws or regulations</li>
              <li>Infringe on intellectual property rights</li>
              <li>Transmit harmful or malicious code</li>
              <li>Engage in fraudulent activities</li>
              <li>Interfere with or disrupt our services</li>
            </ul>

            <h2>5. Payment Terms</h2>
            <ul>
              <li>
                Fees are charged according to your selected plan
              </li>
              <li>
                All fees are non-refundable unless otherwise stated
              </li>
              <li>
                We may change our fees with 30 days&apos; notice
              </li>
              <li>You authorize us to charge your payment method</li>
            </ul>

            <h2>6. Data and Privacy</h2>
            <ul>
              <li>You retain ownership of your data</li>
              <li>We may access your data to provide support</li>
              <li>You are responsible for backing up your data</li>
              <li>
                Our Privacy Policy governs data collection and use
              </li>
            </ul>

            <h2>7. Service Availability</h2>
            <ul>
              <li>
                We strive for 99.9% uptime but make no guarantees
              </li>
              <li>
                We may suspend service for maintenance or security
                reasons
              </li>
              <li>We are not liable for service interruptions</li>
            </ul>

            <h2>8. Intellectual Property</h2>
            <ul>
              <li>
                We retain all rights to our services and content
              </li>
              <li>
                You grant us a license to use your data to provide
                services
              </li>
              <li>
                You must respect third-party intellectual property
                rights
              </li>
            </ul>

            <h2>9. Termination</h2>
            <ul>
              <li>
                Either party may terminate this agreement at any time
              </li>
              <li>
                We may suspend or terminate accounts that violate
                these Terms
              </li>
              <li>
                Upon termination, we will delete your data according
                to our retention policy
              </li>
            </ul>

            <h2>10. Disclaimers</h2>
            <p>
              Our services are provided &ldquo;as is&rdquo; without
              warranties of any kind. We disclaim all warranties,
              express or implied, including merchantability and
              fitness for a particular purpose.
            </p>

            <h2>11. Limitation of Liability</h2>
            <p>
              In no event shall Flowglad be liable for any indirect,
              incidental, special, consequential, or punitive damages,
              including lost profits or data.
            </p>

            <h2>12. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless Flowglad from
              any claims, damages, or expenses arising from your use
              of our services or violation of these Terms.
            </p>

            <h2>13. Governing Law</h2>
            <p>
              These Terms are governed by the laws of [Jurisdiction].
              Any disputes will be resolved in the courts of
              [Jurisdiction].
            </p>

            <h2>14. Changes to Terms</h2>
            <p>
              We may modify these Terms at any time. Material changes
              will be communicated via email or through our services.
              Continued use constitutes acceptance of modified Terms.
            </p>

            <h2>15. Contact Information</h2>
            <p>
              If you have questions about these Terms, please contact
              us at:
            </p>
            <ul>
              <li>Email: legal@flowglad.com</li>
              <li>Address: [Company Address]</li>
            </ul>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
