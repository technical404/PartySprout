import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchCategories, type Category } from "@/lib/marketplace-data";

/**
 * Brand mark and site footer live here rather than in marketplace.tsx so that
 * quote-form.tsx (which needs the footer for its page) can import them without
 * creating an import cycle with the components that need the quote form.
 */

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link to="/" className="group flex items-center gap-2" aria-label="PartySprout home">
    {/* The gift-stack mark from logo.png. The file is a lockup whose wordmark and
        tagline are print-sized; at header height they would render ~7px tall, so
        only the mark is used and the name stays real text beside it. */}
    <img src="/logo-mark.png" alt="" width={88} height={120} className="h-9 w-auto transition-transform group-hover:-rotate-6" />
    {!compact && <span className="font-display text-xl font-extrabold text-inherit">Party<span className="text-primary">Sprout</span></span>}
  </Link>;
}

export function Footer() {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => { void fetchCategories().then(setCategories); }, []);

  const linkClass = "hover:text-background";
  const headingClass = "text-sm font-bold";

  return (
    <footer className="border-t bg-foreground pb-24 pt-14 text-background md:pb-8">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div>
          {/* The mark's artwork is dark navy with rust accents, which disappears
              against the footer's dark panel; a soft pill gives it a lighter, less
              blobby ground than inverting the art for this one context. The pill
              also has to re-set the text colour, since the footer's is light. */}
          <span className="inline-flex w-fit rounded-2xl bg-background/95 px-3 py-2 text-foreground"><Brand /></span>
          <p className="mt-4 max-w-xs text-sm leading-6 text-background/70">
            Find children&rsquo;s party businesses from the live directory, compare them honestly, and
            request a quote in one go.
          </p>
          <Button variant="secondary" size="sm" className="mt-5" asChild>
            <Link to="/request-quote">Request a quote</Link>
          </Button>
        </div>

        <div>
          <h2 className={headingClass}>Discover</h2>
          <ul className="mt-4 space-y-3 text-sm text-background/65">
            {categories.map((cat) => (
              <li key={cat.slug}>
                <Link to="/category/$slug" params={{ slug: cat.slug }} className={linkClass}>
                  {cat.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className={headingClass}>Company</h2>
          <ul className="mt-4 space-y-3 text-sm text-background/65">
            <li><Link to="/about" className={linkClass}>About us</Link></li>
            <li><Link to="/contact" className={linkClass}>Contact us</Link></li>
            <li><Link to="/how-it-works" className={linkClass}>How it works</Link></li>
            <li><Link to="/explore" className={linkClass}>Explore categories</Link></li>
            <li>
              <Link to="/search" search={{ q: "", location: "" }} className={linkClass}>
                Find businesses
              </Link>
            </li>
            <li><Link to="/list-your-business" className={linkClass}>List your business</Link></li>
            <li><Link to="/vendor/dashboard" className={linkClass}>For entertainers</Link></li>
          </ul>
        </div>

        <div>
          <h2 className={headingClass}>Booking &amp; legal</h2>
          <ul className="mt-4 space-y-3 text-sm text-background/65">
            <li><Link to="/request-quote" className={linkClass}>Request a quote</Link></li>
            <li><Link to="/quotes" className={linkClass}>My quotes</Link></li>
            <li><Link to="/favorites" className={linkClass}>Saved entertainers</Link></li>
            <li><Link to="/terms" className={linkClass}>Terms of use</Link></li>
            <li><Link to="/privacy" className={linkClass}>Privacy policy</Link></li>
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-12 flex max-w-7xl flex-wrap items-center justify-between gap-4 border-t border-background/15 px-6 pt-6 text-xs text-background/55">
        <span>© 2026 PartySprout</span>
        <span className="flex flex-wrap gap-4">
          <Link to="/terms" className={linkClass}>Terms</Link>
          <Link to="/privacy" className={linkClass}>Privacy</Link>
          <Link to="/contact" className={linkClass}>Contact</Link>
        </span>
      </div>
    </footer>
  );
}
