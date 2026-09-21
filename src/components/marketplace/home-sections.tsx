import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import superheroesImg from "@/assets/categories/superheroes.jpg";
import magiciansImg from "@/assets/categories/magicians.jpg";
import princessesImg from "@/assets/categories/princesses.jpg";
import guitaristImg from "@/assets/categories/mascots.jpg";
import magicianPartyImg from "@/assets/magician-party.jpg";
import picnicImg from "@/assets/party-hero.jpg";
import {
  BadgeCheck,
  Building2,
  CalendarCheck,
  ChevronRight,
  MapPin,
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

function Polaroid({
  src,
  alt,
  frameClass,
  clipId,
}: {
  src: string;
  alt: string;
  frameClass: string;
  clipId: string;
}) {
  return (
    <div className="relative">
      <svg
        className={`${frameClass} pointer-events-none absolute top-1/2 left-1/2 size-full -translate-x-1/2 -translate-y-1/2 -rotate-[16deg]`}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 448 448"
        fill="none"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M12.2,35C12.2,15.7,27.9,0,47.2,0h353.5c19.3,0,35,15.7,35,35v378c0,19.3-15.7,35-35,35H47.2c-19.3,0-35-15.7-35-35V35Z"
        />
      </svg>
      <svg className="polaroid-frame text-primary relative" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448" fill="none">
        <defs>
          <clipPath id={clipId}>
            <path d="M12.2,35C12.2,15.7,27.9,0,47.2,0h353.5c19.3,0,35,15.7,35,35v378c0,19.3-15.7,35-35,35H47.2c-19.3,0-35-15.7-35-35V35Z" />
          </clipPath>
        </defs>
        <image width="100%" height="100%" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} href={src} />
        <title>{alt}</title>
      </svg>
    </div>
  );
}

export function CelebrationJourneySection() {
  return (
    <section className="space-y-10 bg-background py-20 text-foreground">
      <div className="flex flex-col items-center gap-4 px-4 text-primary">
        <p className="text-sm font-bold uppercase tracking-wide">Simple, clear, delightful</p>
        <h2 className="font-display text-3xl font-extrabold md:text-5xl">From search to celebration</h2>
        <p className="max-w-xs text-center text-pretty text-base text-primary/80 md:text-lg">
          Book the best. Exceptional children&apos;s entertainers are just a few clicks away.
        </p>
      </div>

      <div className="journey-stack mx-auto max-w-7xl px-4 sm:px-6">
        <article className="journey-card relative z-10 flex flex-col overflow-hidden bg-primary-soft xl:sticky xl:top-[100px] xl:flex-row">
          <div className="w-full p-8 lg:w-1/2 lg:p-12">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary lg:hidden">Step 1</p>
            <h3 className="font-display text-2xl font-extrabold text-primary md:text-4xl">Browse and compare</h3>
            <p className="mt-4 max-w-md text-base leading-8 text-primary md:text-lg">
              Uncover trusted superheroes, princesses and magicians in your city, then compare rates and reviews.
            </p>
          </div>
          <div className="relative w-full xl:w-10/12">
            <div className="journey-pattern flex items-center justify-center p-6 lg:py-16">
              <div className="flex gap-4">
                <div className="flex h-auto flex-1 flex-col gap-4">
                  <img src={superheroesImg} alt="Superhero entertainers" className="h-auto rounded-2xl object-cover sm:h-full" />
                  <div className="rounded-2xl bg-blue-600 p-4 font-bold text-white md:p-6">
                    <p className="line-clamp-2 text-xs sm:text-sm md:text-base">
                      Superheroes <span className="text-sky-200">near</span> Dallas, TX
                    </p>
                  </div>
                </div>
                <div className="flex h-auto flex-1 flex-col gap-4">
                  <div className="rounded-2xl bg-amber-300 p-4 font-bold text-primary md:p-6">
                    <p className="text-sm md:text-base">
                      Magician <span className="text-fuchsia-700">near</span> Chicago, IL
                    </p>
                  </div>
                  <img src={magiciansImg} alt="Children&apos;s magician" className="h-auto rounded-2xl object-cover sm:h-full" />
                </div>
                <div className="hidden flex-1 flex-col gap-4 md:flex">
                  <img src={princessesImg} alt="Princess party entertainers" className="h-full rounded-2xl object-cover" />
                  <div className="rounded-2xl bg-primary p-4 font-bold text-primary-foreground md:p-6">
                    <p className="line-clamp-2 text-xs sm:text-sm md:text-base">
                      Princesses <span className="text-fuchsia-200">near</span> Atlanta, GA
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="journey-card relative z-10 flex flex-col bg-[color-mix(in_oklab,var(--primary)_14%,white)] xl:sticky xl:top-[215px] xl:flex-row">
          <div className="w-full p-8 lg:w-1/2 lg:p-12">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary lg:hidden">Step 2</p>
            <h3 className="font-display text-2xl font-extrabold text-primary md:text-4xl">Book securely</h3>
            <p className="mt-4 max-w-md text-base leading-8 text-primary md:text-lg">
              Send one quote request with your date and guest count. Compare replies, then book only when it feels right.
            </p>
          </div>
          <div className="relative w-full xl:w-10/12">
            <div className="journey-pattern flex justify-center p-6 lg:p-16">
              <div className="relative space-y-6">
                <div className="absolute -top-6 -right-6 z-10 rotate-12 sm:-right-8">
                  <div className="size-36 p-[10%] sm:size-48">
                    <Polaroid src={magicianPartyImg} alt="Birthday celebration" frameClass="text-emerald-500" clipId="journey-clip-cake" />
                  </div>
                </div>
                <div className="relative">
                  <svg
                    className="text-orange-300 absolute bottom-0 h-auto w-full -translate-x-5 -rotate-2 sm:h-[88%] sm:w-auto sm:-translate-x-7"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 448 448"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      fill="currentColor"
                      d="M12.2,35C12.2,15.7,27.9,0,47.2,0h353.5c19.3,0,35,15.7,35,35v378c0,19.3-15.7,35-35,35H47.2c-19.3,0-35-15.7-35-35V35Z"
                    />
                  </svg>
                  <div className="relative max-w-sm space-y-4 rounded-2xl bg-white p-6 text-xs text-primary shadow-lg">
                    <div className="flex items-center gap-4">
                      <img src={guitaristImg} width={40} height={40} alt="" className="size-10 rounded-full object-cover" />
                      <p className="text-sm font-bold">Jordan M.</p>
                    </div>
                    <hr />
                    <div>
                      <p className="font-bold">Kids magician</p>
                      <p>Sat April 27</p>
                      <p>4:00 PM – 6:00 PM</p>
                    </div>
                    <div>
                      <p className="font-bold">Event details</p>
                      <p>
                        It&apos;s my daughter&apos;s 7th birthday
                        <span className="hidden sm:inline"> and we&apos;d love a magician for the backyard party</span>.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-lg bg-primary-soft p-4 text-xs">
                        <span className="font-bold">Quote from</span>
                        <span className="font-bold">$225</span>
                      </div>
                      <Link
                        to="/request-quote"
                        className="block w-full rounded-lg bg-primary py-4 text-center text-sm font-semibold text-primary-foreground"
                      >
                        Request a quote
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="journey-card relative z-10 flex flex-col bg-[color-mix(in_oklab,var(--primary)_22%,white)] xl:sticky xl:top-[330px] xl:flex-row">
          <div className="w-full p-8 lg:w-1/2 lg:p-12">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary lg:hidden">Step 3</p>
            <h3 className="font-display text-2xl font-extrabold text-primary md:text-4xl">Enjoy your event</h3>
            <p className="mt-4 max-w-md text-base leading-8 text-primary md:text-lg">
              Watch the birthday spring to life while the entertainer handles the show.
            </p>
            <Button size="lg" asChild className="mt-6">
              <Link to="/request-quote">Start planning</Link>
            </Button>
          </div>
          <div className="relative w-full xl:w-10/12">
            <div className="journey-pattern flex justify-center p-6 lg:py-16">
              <div className="w-full max-w-lg p-[10%]">
                <Polaroid src={picnicImg} alt="Kids party celebration" frameClass="text-fuchsia-500" clipId="journey-clip-picnic" />
              </div>
            </div>
          </div>
        </article>
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
