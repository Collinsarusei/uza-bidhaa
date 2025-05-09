// src/components/layout/footer.tsx
import Link from 'next/link';
import { Icons } from '@/components/icons'; // Assuming you might want icons in the footer later

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 py-6 md:h-20 md:flex-row md:py-0">
        <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
          {/* <Icons.logo /> You can add your logo icon here if you have one */}
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            &copy; {currentYear} Uza Bidhaa. All rights reserved.
          </p>
        </div>
        <nav className="flex items-center gap-4 md:gap-6">
          <Link href="/contact" className="text-sm font-medium text-muted-foreground hover:text-foreground/80 transition-colors">
            Contact & FAQ
          </Link>
          {/* You can add more footer links here, e.g., Terms of Service, Privacy Policy */}
          {/* <Link href="/terms" className="text-sm font-medium text-muted-foreground hover:text-foreground/80 transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="text-sm font-medium text-muted-foreground hover:text-foreground/80 transition-colors">
            Privacy
          </Link> */}
        </nav>
      </div>
    </footer>
  );
}
