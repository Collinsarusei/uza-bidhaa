'use client';

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

export default function HelpCenterPage() {
  const { status } = useSession();
  const router = useRouter();

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

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Help Center</h1>
        <p className="mt-2 text-lg text-muted-foreground dark:text-gray-400">
          Find assistance for common issues or report a problem with a transaction.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {/* Option 1: Buyer Issues (Item Not Received / Not as Described) */}
        <Card className="hover:shadow-lg transition-shadow dark:bg-slate-800">
          <CardHeader>
            <div className="flex items-center mb-2">
                <Icons.package className="h-8 w-8 mr-3 text-primary" />
                <CardTitle className="text-xl">Problem with an Item I Purchased</CardTitle>
            </div>
            <CardDescription>
              Select this if you haven't received an item you paid for, or if the item is significantly different from its description (e.g., damaged, wrong item).
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

        {/* Option 2: Seller Issues (Funds Not Released) */}
        <Card className="hover:shadow-lg transition-shadow dark:bg-slate-800">
          <CardHeader>
             <div className="flex items-center mb-2">
                <Icons.dollarSign className="h-8 w-8 mr-3 text-green-500" />
                <CardTitle className="text-xl">Issue with a Payment I Should Receive</CardTitle>
            </div>
            <CardDescription>
              Select this if a buyer has confirmed receipt (or should have) but the payment has not been released to your earnings balance after a reasonable time.
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

      <div className="mt-12 text-center">
        <p className="text-muted-foreground dark:text-gray-400">
            If your issue isn't covered above, please check our <Link href="/contact" className="underline hover:text-primary">FAQ & Contact Page</Link>.
        </p>
      </div>
    </div>
  );
}
