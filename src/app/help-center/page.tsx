'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How do I track my order?",
    answer: "You can track your order status in the 'My Orders' section of your dashboard. The status will update automatically as the seller processes and ships your item."
  },
  {
    question: "When will I receive my payment as a seller?",
    answer: "Payments are typically released to your earnings balance after the buyer confirms receipt of the item. This usually happens within 1-2 business days after delivery confirmation."
  },
  {
    question: "What if I receive a damaged item?",
    answer: "If you receive a damaged item, please file a dispute through the 'Report Item Issue' option. Make sure to provide clear photos of the damage and keep all packaging materials."
  },
  {
    question: "How do I withdraw my earnings?",
    answer: "You can withdraw your earnings from the 'My Earnings' section of your dashboard. The minimum withdrawal amount is 100 KES, and funds are typically processed within 1-3 business days."
  },
  {
    question: "What payment methods are accepted?",
    answer: "We currently accept M-PESA and bank transfers for payments. More payment methods will be added in the future."
  }
];

export default function HelpCenterPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [contactForm, setContactForm] = useState({
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (status === 'loading') {
    return (
        <div className="flex justify-center items-center min-h-screen">
            <Icons.spinner className="h-10 w-10 animate-spin text-primary" />
        </div>
    );
  }

  if (status === 'unauthenticated') {
    router.replace('/auth?callbackUrl=/help-center');
    return null;
  }

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.subject || !contactForm.message) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contactForm,
          userId: session?.user?.id
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      toast({
        title: "Message Sent",
        description: "We'll get back to you as soon as possible.",
      });
      setContactForm({ subject: '', message: '' });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredFaqs = faqs.filter(faq => 
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Help Center</h1>
        <p className="mt-2 text-lg text-muted-foreground dark:text-gray-400">
          Find assistance for common issues or report a problem with a transaction.
        </p>
      </header>

      {/* Search Section */}
      <div className="max-w-2xl mx-auto mb-12">
        <div className="relative">
          <Input
            type="search"
            placeholder="Search help topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10"
          />
          <Icons.search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* FAQ Section */}
      <div className="max-w-3xl mx-auto mb-12">
        <h2 className="text-2xl font-semibold mb-6">Frequently Asked Questions</h2>
        <Accordion type="single" collapsible className="w-full">
          {filteredFaqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger className="text-left">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent>
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* Dispute Options */}
      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12">
        <Card className="hover:shadow-lg transition-shadow dark:bg-slate-800">
          <CardHeader>
            <div className="flex items-center mb-2">
                <Icons.package className="h-8 w-8 mr-3 text-primary" />
                <CardTitle className="text-xl">Problem with an Item I Purchased</CardTitle>
            </div>
            <CardDescription>
              Select this if you haven't received an item you paid for, or if the item is significantly different from its description.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              You will be asked to provide details about the order and the issue you encountered.
            </p>
            <Link href="/dispute/file-buyer" passHref>
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                <Icons.alertCircle className="mr-2 h-4 w-4" /> Report Item Issue
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow dark:bg-slate-800">
          <CardHeader>
             <div className="flex items-center mb-2">
                <Icons.dollarSign className="h-8 w-8 mr-3 text-green-500" />
                <CardTitle className="text-xl">Issue with a Payment I Should Receive</CardTitle>
            </div>
            <CardDescription>
              Select this if a buyer has confirmed receipt but the payment has not been released to your earnings balance.
            </CardDescription>
          </CardHeader>
          <CardContent>
             <p className="text-sm text-muted-foreground mb-4">
              You will be asked to provide details about the transaction and why you believe funds should be released.
            </p>
            <Link href="/dispute/file-seller" passHref>
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                <Icons.receipt className="mr-2 h-4 w-4" /> Report Payment Issue
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Contact Form */}
      <div className="max-w-2xl mx-auto">
        <Card className="dark:bg-slate-800">
          <CardHeader>
            <CardTitle>Contact Support</CardTitle>
            <CardDescription>
              Can't find what you're looking for? Send us a message and we'll get back to you as soon as possible.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={contactForm.subject}
                  onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="What's your question about?"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={contactForm.message}
                  onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Please provide details about your issue..."
                  required
                  rows={4}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                Send Message
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
