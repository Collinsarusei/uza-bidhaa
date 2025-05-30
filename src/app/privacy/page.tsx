// src/app/privacy/page.tsx
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="text-muted-foreground mt-2">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Introduction</CardTitle>
          <CardDescription>
            At UZA Bidhaa, we take your privacy seriously. This policy describes how we collect, use, and protect your personal information.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-2">Information We Collect</h2>
            <p className="text-muted-foreground">
              We collect information that you provide directly to us, including:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
              <li>Name and contact information</li>
              <li>Phone number (for OTP verification)</li>
              <li>Email address</li>
              <li>Location information</li>
              <li>Payment information (processed securely through Paystack)</li>
              <li>Profile pictures and item images</li>
            </ul>
          </section>

          <Separator />

          <section>
            <h2 className="text-xl font-semibold mb-2">How We Use Your Information</h2>
            <p className="text-muted-foreground">
              We use the collected information to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
              <li>Provide and maintain our services</li>
              <li>Process transactions and payments</li>
              <li>Send you notifications about your account and transactions</li>
              <li>Facilitate communication between buyers and sellers</li>
              <li>Prevent fraud and ensure platform security</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <Separator />

          <section>
            <h2 className="text-xl font-semibold mb-2">Data Security</h2>
            <p className="text-muted-foreground">
              We implement appropriate security measures to protect your personal information:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
              <li>Secure data storage using Prisma and PostgreSQL</li>
              <li>Encrypted communication using HTTPS</li>
              <li>Secure payment processing through Paystack</li>
              <li>Regular security audits and updates</li>
            </ul>
          </section>

          <Separator />

          <section>
            <h2 className="text-xl font-semibold mb-2">Third-Party Services</h2>
            <p className="text-muted-foreground">
              We use the following third-party services:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
              <li>Paystack for payment processing</li>
              <li>UploadThing for file storage</li>
              <li>Firebase for phone OTP verification</li>
              <li>NextAuth.js for authentication</li>
            </ul>
          </section>

          <Separator />

          <section>
            <h2 className="text-xl font-semibold mb-2">Your Rights</h2>
            <p className="text-muted-foreground">
              You have the right to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Opt-out of marketing communications</li>
              <li>Export your data</li>
            </ul>
          </section>

          <Separator />

          <section>
            <h2 className="text-xl font-semibold mb-2">Contact Us</h2>
            <p className="text-muted-foreground">
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <p className="mt-2 text-muted-foreground">
              Email: support@uzabidhaa.com
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
