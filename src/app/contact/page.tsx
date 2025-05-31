// src/app/contact/page.tsx
'use client';

import Link from 'next/link';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useSession } from 'next-auth/react';
import { Mail, MessageSquare } from 'lucide-react'; // Using lucide-react for specific icons

const faqItems = [
  {
    question: "How do I list an item for sale?",
    answer: "To list an item, go to the 'Sell' page from your dashboard. Fill in the item details, including title, description, price, category, and upload photos. Once submitted, your item will be listed on the marketplace.",
  },
  {
    question: "How does the payment and escrow system work?",
    answer: "When a buyer pays for an item, the money is held securely by Uza Bidhaa (in escrow via Paystack). The seller is notified to deliver the item. Once the buyer confirms they have received the item as described, the funds are released to the seller's earnings balance, minus a small platform fee.",
  },
  {
    question: "How do I withdraw my earnings?",
    answer: "You can withdraw your earnings from your 'My Earnings' page in your dashboard. We currently support M-Pesa and bank transfers for withdrawals. Ensure your payout details are correctly set up in your profile.",
  },
  {
    question: "What are the platform fees?",
    answer: "Uza Bidhaa charges a small percentage fee on successful sales to cover operational costs and provide a secure platform. The current fee percentage can be found on our terms of service or by contacting support.",
  },
  {
    question: "How do I resolve a dispute if an item is not received or not as described?",
    answer: "If you have an issue with a transaction (e.g., item not received or not as described), you can file a dispute from your 'My Orders' page. Our admin team will review the case and mediate between the buyer and seller to reach a resolution. This may involve a refund to the buyer or releasing funds to the seller.",
  },
  {
    question: "How long does it take for sellers to get paid after a buyer confirms receipt?",
    answer: "Once a buyer confirms receipt of an item, the funds (minus platform fees) are typically credited to the seller's earnings balance on Uza Bidhaa almost immediately. The seller can then initiate a withdrawal to their M-Pesa or bank account, which is processed according to our payout schedule.",
  },
  {
    question: "How do I contact a seller or buyer?",
    answer: "You can contact a seller before purchasing by using the 'Message Seller' button on the item detail page. Once a transaction is initiated, you may have further communication options through your order details. Always keep communication within the platform for your safety.",
  },
];

export default function ContactFaqPage() {
  const { data: session } = useSession();

  return (
    // Applied a slightly off-white background for less brightness
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-6 md:py-12">
      <div className="container mx-auto max-w-3xl px-4 md:px-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
            Contact Us & FAQs
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Have questions or need assistance? We're here to help!
          </p>
        </div>

        {session && (
          <div className="mb-6 flex justify-center">
            <Link href="/dashboard" passHref>
              <Button variant="outline">
                <Icons.arrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
              </Button>
            </Link>
          </div>
        )}

        <div className="mb-12 rounded-lg border bg-card p-6 shadow-sm dark:border-slate-700">
          <h2 className="mb-4 text-2xl font-semibold text-gray-800 dark:text-gray-200">Get in Touch</h2>
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <Mail className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-300">Email Support</p>
                <a href="mailto:uzabidhaa@gmail.com" className="text-primary hover:underline">
                  uzabidhaa@gmail.com
                </a>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <MessageSquare className="h-6 w-6 text-primary" /> 
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-300">WhatsApp Support</p>
                <a 
                  href="https://wa.me/254743299688" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-primary hover:underline"
                >
                  +254 743 299688 (Click to Chat)
                </a>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            We typically respond within 24 business hours.
          </p>
        </div>

        <div>
          <h2 className="mb-6 text-center text-2xl font-semibold text-gray-800 dark:text-gray-200">
            Frequently Asked Questions
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((item, index) => (
              <AccordionItem value={`item-${index + 1}`} key={index} className="border-b dark:border-slate-700">
                <AccordionTrigger className="text-left hover:no-underline text-gray-700 dark:text-gray-300">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground dark:text-slate-400">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
