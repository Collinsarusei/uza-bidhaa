'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { User } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Item } from '@/lib/types';
import { Icons } from '@/components/icons';

// --- Animated Images Setup ---
const images = [
  '/images/furniture1.jpg',
  '/images/furniture2.jpg',
  '/images/furniture3.jpg',
  '/images/furniture4.jpg',
  '/images/laptop1.jpg',
  '/images/laptop2.jpg',
  '/images/phone1.jpg',
  '/images/phone2.jpg',
  '/images/shoe1.jpg',
  '/images/shoe2.jpg',
  '/images/shoe3.jpg',
  '/images/suit1.jpg',
  '/images/utensils.jpg',
];

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  // --- Animated Header Effect ---
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 3000);
    return () => clearInterval(intervalId);
  }, []);

  // --- Fetch Items Effect ---
  useEffect(() => {
    const fetchItems = async () => {
      setItemsLoading(true);
      setItemsError(null);
      try {
        const response = await fetch('/api/items');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setItems(data.slice(0, 8)); // Limit items displayed
      } catch (err) {
        let message = "Failed to fetch featured items.";
        if (err instanceof Error) message = err.message;
        setItemsError(message);
        console.error("Error fetching homepage items:", err);
      } finally {
        setItemsLoading(false);
      }
    };
    fetchItems();
  }, []);

  // --- Click Handlers ---
  const handleSellClick = () => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth');
      return;
    }
    // Add KYC check here when implemented
    router.push('/sell');
  };

  const handleMessageSellerClick = () => {
    if (status === 'loading') return;
    if (!session) {
      toast({ title: 'Login Required', description: 'Please log in to message sellers.' });
      router.push('/auth');
    } else {
      toast({ title: 'Action Required', description: 'Please message sellers from the dashboard.' });
      router.push('/dashboard');
    }
  };

  // --- Component Render ---
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-background border-b px-4 md:px-6 h-16 flex items-center justify-between sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2" prefetch={false}>
          <span className="font-semibold text-lg">Uza Bidhaa Marketplace</span>
        </Link>
        <nav className="flex items-center gap-2"> {/* Reduced gap */}
          <Button onClick={handleSellClick}>Sell</Button>
          {/* Conditional rendering based on authentication status */}
          {status === 'loading' ? (
             <Skeleton className="h-9 w-9 rounded-full" /> /* Loading state */
          ) : status === 'authenticated' && session.user ? (
            <Link href="/dashboard/profile"> {/* Corrected Link destination */}
              <Avatar className="h-9 w-9">
                {session.user.image && <AvatarImage src={session.user.image} alt={session.user.name ?? 'User'} />}
                <AvatarFallback>{session.user.name?.[0]?.toUpperCase() ?? 'U'}</AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <> {/* Use Fragment for multiple elements */}
              <Link href="/auth/register" passHref>
                 <Button variant="outline">Sign Up</Button>
              </Link>
              <Link href="/auth" passHref>
                 <Button>Login</Button>
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {/* Animated Image Section */}
        <section className="relative w-full h-[400px] overflow-hidden">
          {images.map((src, index) => (
            <Image
              key={src} src={src} alt={`Showcase Item ${index + 1}`} fill={true}
              style={{ objectFit: 'cover' }}
              className={`absolute transition-opacity duration-1000 ease-in-out ${index === currentIndex ? 'opacity-100' : 'opacity-0'}`}
              priority={index === 0}
            />
          ))}
           <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center text-center text-white p-4">
              <h1 className="text-4xl font-bold mb-4">Welcome to Uza Bidhaa Marketplace!</h1>
              <p className="text-xl max-w-2xl">Discover a wide variety of products or sell your own items easily. Your trusted online market in the region.</p>
          </div>
        </section>

        {/* Featured Items Section */}
        <section className="py-12 px-4 md:px-6">
          <h2 className="text-3xl font-bold text-center mb-8">Featured Items</h2>
          {itemsLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, index) => (
                    <Card key={index}><CardHeader className="p-0"><Skeleton className="h-48 w-full rounded-t-lg" /></CardHeader><CardContent className="p-4"><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></CardContent><CardFooter className="p-4 pt-0"><Skeleton className="h-10 w-full" /></CardFooter></Card>
                ))}
            </div>
          )}
          {!itemsLoading && itemsError && ( <p className="text-center text-destructive">Error loading items: {itemsError}</p> )}
          {!itemsLoading && !itemsError && items.length === 0 && ( <p className="text-center text-muted-foreground">No featured items available.</p> )}
          {!itemsLoading && !itemsError && items.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {items.map((item) => (
                 <Card key={item.id} className="flex flex-col overflow-hidden">
                    <CardHeader className="p-0"><div className="relative h-48 w-full">
                        <Image src={item.mediaUrls && item.mediaUrls.length > 0 ? item.mediaUrls[0] : '/images/default-item.jpg'} alt={item.title} fill={true} style={{ objectFit: 'cover' }} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" />
                    </div></CardHeader>
                    <CardContent className="p-4 flex-grow"><CardTitle className="text-lg font-semibold mb-1 truncate">{item.title}</CardTitle><p className="text-gray-700 dark:text-gray-300 font-medium">KES {item.price.toLocaleString()}</p></CardContent>
                    <CardFooter className="p-4 pt-0"><Button className="w-full" onClick={handleMessageSellerClick}> Message Seller </Button></CardFooter>
                 </Card>
              ))}
            </div>
          )}
        </section>

        {/* Chatbot Placeholder */}
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground p-3 rounded-full shadow-lg cursor-pointer hover:bg-primary/90 z-40">
          <Icons.bot className="h-6 w-6" /> <span className="sr-only">Chat with us</span>
        </div>
      </main>

      {/* Footer */}
       <footer className="bg-black text-white p-6 md:py-8 w-full border-t border-gray-700">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-center gap-4">
           <p className="text-xs">© {new Date().getFullYear()} Uza Bidhaa Marketplace. All rights reserved.</p>
           <nav className="flex gap-4">
             <Link href="/terms" className="text-xs hover:underline hover:text-gray-300 underline-offset-4" prefetch={false}>Terms of Service</Link>
             <Link href="/privacy" className="text-xs hover:underline hover:text-gray-300 underline-offset-4" prefetch={false}>Privacy Policy</Link>
           </nav>
         </div>
       </footer>
    </div>
  );
}
