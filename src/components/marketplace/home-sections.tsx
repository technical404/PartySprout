import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  CalendarCheck,
  ChevronRight,
  MapPin,
  PartyPopper,
  Quote,
  Search,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VendorCard } from "./marketplace";
import type { Category, City, Vendor } from "@/lib/marketplace-data";

function SectionHead({
  kicker,
  title,
  action,
}: {
  kicker: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-primary">{kicker}</p>
        <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Popular party entertainment — flip cards showing each category's specialties */
/* ------------------------------------------------------------------------- */

function CategoryFlipCard({ category }: { category: Category }) {
  // `flipped` is the explicit toggle (tap, click or Enter); `hovered` is the
  // pointer preview. Both drive the same `data-flipped` attribute that the CSS
  // uses for the rotation and for swapping which face accepts pointer events.
  const [flipped, setFlipped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const showBack = flipped || hovered;
  const specialties = category.subcategories;

  // The back face is a fixed-height box (the card's aspect ratio), so the chips
  // must fit rather than overflow: show at most five, folding the rest into a
  // "+N more" chip that the Explore link expands.
  const MAX_CHIPS = 5;
  const shownSpecialties =
    specialties.length > MAX_CHIPS ? specialties.slice(0, MAX_CHIPS - 1) : specialties;
  const hiddenCount = specialties.length - shownSpecialties.length;

  return (
    <div
      className="flip-card aspect-[.78]"
      data-flipped={showBack}
      // Only real mouse pointers preview on hover. Touch and pen report their
      // own pointerType, so they keep the tap-to-flip behaviour instead of
      // flipping on first touch with no way to flip back.
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHovered(false);
      }}
    >
      <div className="flip-inner">
        <div className="flip-face flip-front" inert={showBack}>
          <img src={category.image} alt="" loading="lazy" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/92 via-foreground/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 text-background">
            <h3 className="font-display text-lg font-extrabold">{category.name}</h3>
            <p className="mt-1 line-clamp-2 text-xs text-background/80">{category.description}</p>
            <p className="mt-2 text-xs font-bold">{category.count} nearby</p>
          </div>
          {/* Pointer devices flip on hover, so this button is the touch and
              keyboard path to the same content. */}
          <button
            type="button"
            onClick={() => setFlipped(true)}
            className="absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-background"
          >
            <span className="sr-only">Show what&rsquo;s inside {category.name}</span>
          </button>
        </div>

        <div
          className="flip-face flip-back flex flex-col border border-border bg-background p-4"
          inert={!showBack}
        >
          <p className="text-xs font-bold uppercase text-primary">What&rsquo;s inside</p>
          <h3 className="mt-1 font-display text-lg font-extrabold">{category.name}</h3>
          {specialties.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {shownSpecialties.map((name) => (
                <li
                  key={name}
                  className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary"
                >
                  {name}
                </li>
              ))}
              {hiddenCount > 0 && (
                <li className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  +{hiddenCount} more
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Specialties coming soon.</p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            <Button size="sm" asChild>
              <Link to="/category/$slug" params={{ slug: category.slug }}>
                Explore
              </Link>
            </Button>
            {/* Clears the hover preview too, otherwise a mouse user could never
                dismiss the back face — the pointer is still over the card, so
                `onPointerEnter` will not fire again to set it back. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFlipped(false);
                setHovered(false);
              }}
            >
              Back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PopularEntertainmentSection({ categories }: { categories: Category[] }) {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead
          kicker="Start with a favorite"
          title="Popular party entertainment"
          action={
            <Link to="/explore" className="font-bold text-primary">
              See all categories →
            </Link>
          }
        />
        <p className="mb-6 -mt-4 text-sm text-muted-foreground">
          Hover a card to see the specialties inside.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {categories.slice(0, 10).map((category) => (
            <CategoryFlipCard key={category.slug} category={category} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Browse by city                                                             */
/* ------------------------------------------------------------------------- */

export function BrowseByCitySection({ cities }: { cities: City[] }) {
  return (
    <section className="bg-surface py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead
          kicker="From the live directory"
          title="Browse by city"
          action={
            <Button variant="outline" asChild>
              <Link to="/search" search={{ q: "", location: "" }}>
                Search all cities
              </Link>
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cities.map((city) => (
            <Link
              key={city.label}
              to="/search"
              search={{ q: "", location: city.label }}
              className="group flex items-center gap-4 rounded-lg border bg-background p-5 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                <MapPin className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-lg font-extrabold">
                  {city.name}
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                  {city.stateCode} · {city.count} entertainers
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-primary transition group-hover:translate-x-1" />
            </Link>
          ))}
          {cities.length === 0 && (
            <p className="col-span-full rounded-lg border bg-background p-6 text-muted-foreground">
              No cities with listings yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Featured entertainers — continuously scrolling carousel                    */
/* ------------------------------------------------------------------------- */

export function FeaturedCarouselSection({ vendors }: { vendors: Vendor[] }) {
  if (vendors.length === 0) return null;

  // Duration scales with how many cards there are, so the speed stays constant.
  const duration = `${Math.max(30, vendors.length * 8)}s`;

  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead
          kicker="Loved by local families"
          title="Featured entertainers"
          action={
            <Button variant="outline" asChild>
              <Link to="/search" search={{ q: "", location: "" }}>
                View all
              </Link>
            </Button>
          }
        />
      </div>
      {/* Full-bleed track so cards run to the edges of the viewport. */}
      <div className="marquee" role="region" aria-label="Featured entertainers, scrolling">
        <div
          className="marquee-track"
          style={{ "--marquee-duration": duration } as React.CSSProperties}
        >
          {[0, 1].map((copy) => (
            <div key={copy} className="flex" aria-hidden={copy === 1}>
              {vendors.map((vendor) => (
                <div key={`${copy}-${vendor.id}`} className="marquee-item w-[320px] sm:w-[420px]">
                  <VendorCard vendor={vendor} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* From search to celebration — scroll-driven sticky stack                    */
/* ------------------------------------------------------------------------- */

const JOURNEY = [
  {
    title: "Search",
    copy: "Tell us the party dream and we surface the entertainers who fit it.",
    Icon: Search,
  },
  {
    title: "Compare",
    copy: "See price, trust signals and fit side by side before you commit.",
    Icon: ArrowLeftRight,
  },
  {
    title: "Request a quote",
    copy: "Share your date, city and guest count once and reach several businesses.",
    Icon: Send,
  },
  {
    title: "Book",
    copy: "Choose with confidence, knowing exactly what you are getting.",
    Icon: CalendarCheck,
  },
  {
    title: "Celebrate",
    copy: "Make a core memory while the entertainer handles the rest.",
    Icon: PartyPopper,
  },
];

/** 0 → 1 as the section scrolls from entering the viewport to leaving it. */
function useSectionProgress(ref: RefObject<HTMLDivElement | null>) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      if (scrollable <= 0) {
        setProgress(0);
        return;
      }
      const passed = Math.min(Math.max(-rect.top, 0), scrollable);
      setProgress(passed / scrollable);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ref]);

  return progress;
}

function clamp01(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function CelebrationJourneySection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = useSectionProgress(containerRef);
  const lastIndex = JOURNEY.length - 1;

  return (
    <section className="bg-foreground py-20 text-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead kicker="Simple, clear, delightful" title="From search to celebration" />
      </div>

      <div ref={containerRef} className="relative" style={{ height: `${JOURNEY.length * 100}vh` }}>
        {JOURNEY.map((step, index) => {
          // How many cards have stacked on top of this one (0 = still the front
          // of the deck). Deliberately unclamped: clamping would push every
          // buried card onto one identical scale, flattening the deck into a
          // single layer instead of five.
          const buriedLayers = Math.max(0, progress * lastIndex - index);
          const scale = clamp01(1 - buriedLayers * 0.045, 0.84, 1);

          return (
            <div
              key={step.title}
              className="sticky flex h-screen items-center justify-center px-4"
              style={{ top: `${72 + index * 16}px`, zIndex: index + 1 }}
            >
              <article
                className={cn(
                  "journey-panel w-full max-w-3xl rounded-2xl border border-background/15 bg-background p-8 text-foreground shadow-2xl sm:p-12",
                )}
                style={{ transform: `scale(${scale})` }}
              >
                <div className="flex items-center gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                    <step.Icon className="size-6" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase text-primary">
                      Step {index + 1} of {JOURNEY.length}
                    </p>
                    <h3 className="font-display text-2xl font-extrabold sm:text-3xl">
                      {step.title}
                    </h3>
                  </div>
                </div>
                <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">
                  {step.copy}
                </p>
                <div className="mt-7 flex flex-wrap gap-2">
                  {JOURNEY.map((other, dot) => (
                    <span
                      key={other.title}
                      aria-hidden
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300",
                        dot === index ? "w-8 bg-primary" : "w-4 bg-border",
                      )}
                    />
                  ))}
                </div>
              </article>
            </div>
          );
        })}
      </div>

      <div className="mx-auto flex max-w-7xl justify-center px-4 pt-8 sm:px-6">
        <Button size="lg" asChild className="h-14 px-10 text-base">
          <Link to="/request-quote">Request a quote</Link>
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* General quote call-to-action                                               */
/* ------------------------------------------------------------------------- */

export function GeneralQuoteCta({ supportEmail }: { supportEmail: string }) {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-2xl border bg-background">
          <div className="grid items-center gap-8 p-8 sm:p-12 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-bold text-primary">
                <Sparkles className="size-4" />
                Not sure who to pick?
              </p>
              <h2 className="mt-3 font-display text-3xl font-extrabold sm:text-4xl">
                Tell us about the party once.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-8 text-muted-foreground">
                Send one request and let matching entertainers come to you. No account needed, and
                no obligation to book.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button size="lg" asChild>
                  <Link to="/request-quote">
                    <Send />
                    Request a quote
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/how-it-works">How it works</Link>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Prefer email? Write to{" "}
                <a className="font-semibold text-primary underline" href={`mailto:${supportEmail}`}>
                  {supportEmail}
                </a>
                .
              </p>
            </div>
            <ul className="grid gap-3">
              {[
                { Icon: Search, text: "One form, matched to local entertainers" },
                { Icon: Building2, text: "Compare replies side by side" },
                { Icon: CalendarCheck, text: "Book only when it feels right" },
              ].map(({ Icon, text }) => (
                <li
                  key={text}
                  className="flex items-center gap-3 rounded-lg border bg-surface p-4 text-sm font-semibold"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                    <Icon className="size-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
