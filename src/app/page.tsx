'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSession, signOut } from 'next-auth/react'; // Import signOut
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { User } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Item } from '@/lib/types';
import { Icons } from '@/components/icons';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"; // Import Sheet components

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
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false); // State for mobile nav

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 3000);
    return () => clearInterval(intervalId);
  }, []);

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
        setItems(data.slice(0, 8)); 
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

  const handleSellClick = () => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth');
      return;
    }
    router.push('/sell');
  };

  const handleLogout = async () => { // Add logout handler
      await signOut({ redirect: false }); 
      setIsMobileNavOpen(false); // Close nav on logout
      // No explicit redirect needed, session change will update UI
  };

  // --- Component Render ---
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-background border-b px-4 md:px-6 h-16 flex items-center justify-between sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2" prefetch={false}>
          <span className="font-semibold text-lg">Uza Bidhaa Marketplace</span>
        </Link>
        
        {/* --- Desktop Nav --- */} 
        <nav className="hidden md:flex items-center gap-2"> 
          <Button onClick={handleSellClick}>Sell</Button>
          {status === 'loading' ? (
             <Skeleton className="h-9 w-9 rounded-full" /> 
          ) : status === 'authenticated' && session.user ? (
            <Link href="/dashboard"> {/* Link to dashboard for logged in user */} 
              <Avatar className="h-9 w-9">
                {session.user.image && <AvatarImage src={session.user.image} alt={session.user.name ?? 'User'} />}
                <AvatarFallback>{session.user.name?.[0]?.toUpperCase() ?? 'U'}</AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <> 
              <Link href="/auth/register" passHref>
                 <Button variant="outline">Sign Up</Button>
              </Link>
              <Link href="/auth" passHref>
                 <Button>Login</Button>
              </Link>
            </>
          )}
        </nav>

        {/* --- Mobile Nav Trigger --- */} 
         <div className="md:hidden">
            <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
                 <SheetTrigger asChild>
                     <Button variant="ghost" size="icon">
                        <Icons.menu className="h-6 w-6" /> 
                        <span className="sr-only">Open Menu</span>
                     </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[250px]">
                     <SheetHeader className="border-b pb-4 mb-4">
                         <SheetTitle>Menu</SheetTitle>
                     </SheetHeader>
                     <div className="flex flex-col gap-3">
                         {/* Always show Sell */} 
                         <Button variant="ghost" onClick={() => { handleSellClick(); setIsMobileNavOpen(false); }} className="w-full justify-start">Sell Item</Button>
                         <hr/> { /* Separator */ }
                         {status === 'loading' ? (
                             <Skeleton className="h-8 w-full rounded-md" />
                         ) : status === 'authenticated' ? (
                             <>
                                 <Link href="/dashboard" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Dashboard</Button></Link>
                                 <Link href="/messages" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Messages</Button></Link>
                                 <Link href="/notifications" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Notifications</Button></Link>
                                 <Link href="/profile" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Profile</Button></Link>
                                 <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-red-600 hover:text-red-700">Logout</Button>
                             </>
                         ) : (
                             <>
                                 <Link href="/auth/register" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Sign Up</Button></Link>
                                 <Link href="/auth" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Login</Button></Link>
                             </>
                         )}
                     </div>
                </SheetContent>
             </Sheet>
        </div>

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
             <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {Array.from({ length: 8 }).map((_, index) => (
                    <Card key={index}><CardHeader className="p-0"><Skeleton className="h-48 w-full rounded-t-lg" /></CardHeader><CardContent className="p-4"><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></CardContent><CardFooter className="p-4 pt-0"><Skeleton className="h-10 w-full" /></CardFooter></Card>
                ))}
            </div>
          )}
          {!itemsLoading && itemsError && ( <p className="text-center text-destructive">Error loading items: {itemsError}</p> )}
          {!itemsLoading && !itemsError && items.length === 0 && ( <p className="text-center text-muted-foreground">No featured items available.</p> )}
          {!itemsLoading && !itemsError && items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6"> {/* Adjusted grid */} 
              {items.map((item) => (
                 <Card key={item.id} className="flex flex-col overflow-hidden">
                    <CardHeader className="p-0">
                        <Link href={`/item/${item.id}`} passHref className="block relative h-48 w-full"> {/* Link wrapper */} 
                            <Image src={item.mediaUrls && item.mediaUrls.length > 0 ? item.mediaUrls[0] : '/images/default-item.jpg'} alt={item.title} fill={true} style={{ objectFit: 'cover' }} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 25vw" className="rounded-t-lg" />
                         </Link>
                    </CardHeader>
                    <CardContent className="p-4 flex-grow">
                         <Link href={`/item/${item.id}`} passHref>
                             <CardTitle className="text-lg font-semibold mb-1 truncate hover:underline">{item.title}</CardTitle>
                         </Link>
                         <p className="text-gray-700 dark:text-gray-300 font-medium">KES {item.price.toLocaleString()}</p>
                    </CardContent>
                     <CardFooter className="p-4 pt-0">
                         {/* Use Link for View Details */} 
                         <Link href={`/item/${item.id}`} passHref className="w-full">
                              <Button variant="outline" className="w-full"> View Details </Button>
                         </Link>
                         {/* Message seller button removed from homepage as it requires login and context */}
                     </CardFooter>
                 </Card>
              ))}
            </div>
          )}
        </section>

        {/* Chatbot Placeholder */}
        {/* Consider conditionally rendering based on page or user state */}
        {/* <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground p-3 rounded-full shadow-lg cursor-pointer hover:bg-primary/90 z-40">
          <Icons.bot className="h-6 w-6" /> <span className="sr-only">Chat with us</span>
        </div> */}
      </main>

      {/* Removed the duplicate footer that was here */}
    </div>
  );
}
