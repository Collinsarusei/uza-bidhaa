// src/components/layout/footer.tsx
import Link from 'next/link';
import { Icons } from '@/components/icons'; 

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-black text-gray-300"> {/* Changed to black background, light gray text */}
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 py-6 md:h-20 md:flex-row md:py-0">
        <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
          {/* <Icons.logo className="h-6 w-6 text-white" /> You can add your logo icon here */}
          <p className="text-center text-sm leading-loose md:text-left">
            &copy; {currentYear} Uza Bidhaa. All rights reserved.
          </p>
        </div>
        <nav className="flex items-center gap-4 md:gap-6">
          <Link href="/contact" className="text-sm font-medium hover:text-white transition-colors">
            Contact & FAQ
          </Link>
          <Link href="/terms" className="text-sm font-medium hover:text-white transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="text-sm font-medium hover:text-white transition-colors">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
