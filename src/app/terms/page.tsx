// src/app/terms/page.tsx
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

export default function TermsOfServicePage() {
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
          Terms of Service
        </h1>
        
        <div className="prose prose-slate dark:prose-invert max-w-none bg-card dark:bg-slate-800 p-6 rounded-lg shadow">
          <p className="text-muted-foreground dark:text-slate-400">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <h2>1. Agreement to Terms</h2>
          <p>
            By using Uza Bidhaa Marketplace (&quot;the Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you disagree with any part of the terms, then you may not access the Service.
          </p>

          <h2>2. User Accounts</h2>
          <p>
            When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Service.
          </p>
          <p>
            You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password, whether your password is with our Service or a third-party service.
          </p>

          <h2>3. Content</h2>
          <p>
            Our Service allows you to post, link, store, share and otherwise make available certain information, text, graphics, videos, or other material (&quot;Content&quot;). You are responsible for the Content that you post on or through the Service, including its legality, reliability, and appropriateness.
          </p>
          <p>
            You retain any and all of your rights to any Content you submit, post or display on or through the Service and you are responsible for protecting those rights. We take no responsibility and assume no liability for Content you or any third party posts on or through the Service.
          </p>

          <h2>4. Prohibited Uses</h2>
          <p>
            You may use the Service only for lawful purposes and in accordance with Terms. You agree not to use the Service:
          </p>
          <ul>
            <li>In any way that violates any applicable national or international law or regulation.</li>
            <li>For the purpose of exploiting, harming, or attempting to exploit or harm minors in any way.</li>
            <li>To transmit, or procure the sending of, any advertising or promotional material, including any &quot;junk mail&quot;, &quot;chain letter,&quot; &quot;spam,&quot; or any other similar solicitation.</li>
            <li>To impersonate or attempt to impersonate the Company, a Company employee, another user, or any other person or entity.</li>
          </ul>

          {/* Add more sections as per your actual policy (e.g., Intellectual Property, Termination, Limitation of Liability, Governing Law, Changes to Terms, Contact) */}
          <h2>Placeholder Sections:</h2>
          <p>Please replace this placeholder content with your full Terms of Service, including details on intellectual property, user conduct, purchases, fees, termination, disclaimers of warranties, limitation of liability, governing law, changes to terms, and detailed contact information.</p>
        </div>
      </div>
    </div>
  );
}
