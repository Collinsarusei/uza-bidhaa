// src/app/privacy/page.tsx
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8 md:py-12">
      <div className="container mx-auto max-w-3xl px-4 md:px-6">
        <div className="mb-6">
          <Link href="/" passHref>
            <Button variant="outline">
              <Icons.arrowLeft className="mr-2 h-4 w-4" /> Back to Home
            </Button>
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl mb-8">
          Privacy Policy
        </h1>
        
        <div className="prose prose-slate dark:prose-invert max-w-none bg-card dark:bg-slate-800 p-6 rounded-lg shadow">
          <p className="text-muted-foreground dark:text-slate-400">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <h2>1. Introduction</h2>
          <p>
            Welcome to Uza Bidhaa Marketplace (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;). We are committed to protecting your personal information and your right to privacy. If you have any questions or concerns about this privacy notice, or our practices with regards to your personal information, please contact us at uzabidhaa@gmail.com.
          </p>

          <h2>2. Information We Collect</h2>
          <p>
            We collect personal information that you voluntarily provide to us when you register on the marketplace, express an interest in obtaining information about us or our products and services, when you participate in activities on the marketplace (such as posting items, making purchases, or sending messages) or otherwise when you contact us.
          </p>
          <p>
            The personal information that we collect depends on the context of your interactions with us and the marketplace, the choices you make and the products and features you use. The personal information we collect may include the following: name, phone number, email address, mailing address, user preferences, and payment data (processed by our payment partners like Paystack).
          </p>

          <h2>3. How We Use Your Information</h2>
          <p>
            We use personal information collected via our marketplace for a variety of business purposes described below. We process your personal information for these purposes in reliance on our legitimate business interests, in order to enter into or perform a contract with you, with your consent, and/or for compliance with our legal obligations.
          </p>
          <ul>
            <li>To facilitate account creation and logon process.</li>
            <li>To post testimonials.</li>
            <li>To manage user accounts.</li>
            <li>To send administrative information to you.</li>
            <li>To protect our Services.</li>
            <li>To enforce our terms, conditions and policies for business purposes, to comply with legal and regulatory requirements or in connection with our contract.</li>
            <li>To respond to legal requests and prevent harm.</li>
          </ul>

          <h2>4. Will Your Information Be Shared With Anyone?</h2>
          <p>
            We only share information with your consent, to comply with laws, to provide you with services, to protect your rights, or to fulfill business obligations (e.g., with payment processors like Paystack for transactions).
          </p>
          
          {/* Add more sections as per your actual policy (e.g., Cookies, Data Retention, Your Rights, Contact) */}
          <h2>Placeholder Sections:</h2>
          <p>Please replace this placeholder content with your full Privacy Policy, including details on data security, cookies, data retention, user rights (GDPR/CCPA if applicable), international transfers, policy updates, and detailed contact information for privacy-specific concerns.</p>
        </div>
      </div>
    </div>
  );
}
