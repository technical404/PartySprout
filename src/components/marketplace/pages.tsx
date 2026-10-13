import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Cake, Camera, Dice5, DoorOpen, Palette, Sparkles } from "lucide-react";
import birthdayCeremonyImage from "@/assets/activity/birthday-ceremony.png";
import facePaintingImage from "@/assets/activity/face-painting.webp";
import gamesImage from "@/assets/activity/games.png";
import grandEntranceImage from "@/assets/activity/grand-entrance.webp";
import interactiveStorytimeImage from "@/assets/activity/interactive-storytime.webp";
import photoOpportunitiesImage from "@/assets/activity/photo-opportunities.webp";
import { Button } from "@/components/ui/button";
import { Footer, QuoteDialog, Rating, SearchPanel, VendorLogo, imageFallback } from "./marketplace";
import {
  BrowseByCitySection, CelebrationJourneySection, FeaturedCarouselSection,
  GeneralQuoteCta, PopularEntertainmentSection,
} from "./home-sections";
import { fetchCategories, fetchCities, fetchListings, type Category, type City, type Vendor } from "@/lib/marketplace-data";
import { SUPPORT_EMAIL } from "@/lib/site";
import heroImage from "@/assets/party-hero.jpg";

/**
 * Marketing and browsing pages. The account, vendor, admin, saved, compare and
 * quote screens live in their own modules so each file stays about one job.
 */

export function HomePage() {
  const [primaryCategories, setPrimaryCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  useEffect(() => {
    void fetchCategories().then(setPrimaryCategories);
    void fetchListings({ pageSize: 10 }).then((data) => setVendors(data.items));
    void fetchCities(12).then(setCities);
  }, []);
  return <main><section className="relative isolate min-h-[760px] overflow-hidden bg-foreground"><img src={heroImage} alt="Children celebrating with a superhero entertainer" width={1920} height={1104} className="absolute inset-0 h-full w-full object-cover object-center" /><div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/55 to-transparent" /><div className="relative mx-auto flex min-h-[760px] max-w-7xl items-center px-4 pb-24 pt-16 sm:px-6"><div className="max-w-4xl"><p className="mb-4 inline-flex items-center gap-2 rounded-full border border-background/25 bg-background/10 px-4 py-2 text-sm font-bold text-background backdrop-blur"><Sparkles className="size-4 text-rating" />Celebrations start here</p><h1 className="max-w-3xl font-display text-5xl font-extrabold leading-[1.02] text-background sm:text-7xl">Make Their Birthday Unforgettable.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-background/85">Find amazing superheroes, princesses, mascots, magicians and children&rsquo;s entertainers near you.</p><div className="mt-9"><SearchPanel /></div><p className="mt-4 text-sm text-background/75">Popular: superhero birthday · princess for 10 kids · magician under $300</p></div></div></section>
    <PopularEntertainmentSection categories={primaryCategories} />
    <BrowseByCitySection cities={cities} />
    <FeaturedCarouselSection vendors={vendors} />
    <CelebrationJourneySection />
    <GeneralQuoteCta supportEmail={SUPPORT_EMAIL} />
    <Footer /></main>;
}

function Section({ title, kicker, action, children }: { title: string; kicker: string; action?: ReactNode; children: ReactNode }) { return <section className="py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6"><div className="mb-8 flex items-end justify-between gap-4"><div><p className="text-sm font-bold text-primary">{kicker}</p><h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">{title}</h2></div>{action}</div>{children}</div></section>; }

export function ExplorePage() {
  const [primaryCategories, setPrimaryCategories] = useState<Category[]>([]);
  useEffect(() => { void fetchCategories().then(setPrimaryCategories); }, []);
  return <main><div className="bg-surface py-14"><div className="mx-auto max-w-7xl px-6"><p className="font-bold text-primary">Explore every possibility</p><h1 className="mt-2 font-display text-4xl font-extrabold">What will make them light up?</h1><div className="mt-7"><SearchPanel /></div></div></div><Section title="Featured categories" kicker="The most-loved ways to celebrate"><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{primaryCategories.map((category)=><Link key={category.slug} to="/category/$slug" params={{slug:category.slug}} className="group grid grid-cols-[120px_1fr] overflow-hidden rounded-lg border bg-background"><img src={category.image} alt={category.name} className="h-full min-h-32 w-full object-cover transition group-hover:scale-105"/><div className="p-5"><h2 className="font-display text-xl font-extrabold">{category.name}</h2><p className="mt-2 text-sm text-muted-foreground">{category.description}</p><p className="mt-4 text-xs font-bold text-primary">{category.count} entertainers</p></div></Link>)}</div></Section><Footer/></main>; }

/**
 * The site address a visitor actually recognises: no scheme, no "www." prefix.
 * Shown as plain text, because the listing does not link out to the business.
 */
function websiteDomain(url: string): string {
  const trimmed = url.trim();
  try {
    return new URL(trimmed).hostname.replace(/^www\./i, "");
  } catch {
    return (
      trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[/?#].*$/, "") ||
      trimmed
    );
  }
}

/**
 * One shape for every activity card. The icon is a lucide component rather than a
 * node so the list below stays a plain table of activity to icon.
 */
type Activity = {
  key: string;
  title: string;
  description: string;
  icon: typeof Sparkles;
  image: string;
};

/**
 * The six activities every listing page shows, in the order they run through a
 * party. The copy keeps the source's conditional tone ("you can", "would be",
 * "can apply") because these are invitations and suggestions for the host rather
 * than promises about a given booking.
 *
 * The pictures are bundled from src/assets/activity rather than hotlinked: six
 * cross-domain requests on every listing page would break whenever the source site
 * moves a file or blocks hotlinking, and Vite fingerprints these into /assets/,
 * which the existing deploy already uploads.
 */
const ACTIVITIES: Activity[] = [
  {
    key: "grand-entrance",
    title: "Grand Entrance",
    description: "You can invite your child’s favorite character to the party! Make sure your camera is ready to capture their reaction.",
    icon: DoorOpen,
    image: grandEntranceImage,
  },
  {
    key: "birthday-ceremony",
    title: "Birthday Ceremony",
    description: "Ten minutes or so before the entertainer must depart, bring out the cake and sing Happy Birthday to the Birthday Girl/Boy.",
    icon: Cake,
    image: birthdayCeremonyImage,
  },
  {
    key: "interactive-storytime",
    title: "Interactive Storytime",
    description: "Our entertainer would be a wonderful and animated storyteller who could read a few of your child’s favorite stories from a mascot.",
    icon: BookOpen,
    image: interactiveStorytimeImage,
  },
  {
    key: "face-painting",
    title: "Face Painting",
    description: "The performer can apply simple designs such as flowers, snowflakes, butterflies, and more with a sprinkle of glitter to cheeks, hands, and foreheads!",
    icon: Palette,
    image: facePaintingImage,
  },
  {
    key: "games",
    title: "Games",
    description: "The entertainer will bring a plush Cat in the Hat to play themed games such as “Hot Potato” with the Cat, “Hide and Seek with the Cat,” and others.",
    icon: Dice5,
    image: gamesImage,
  },
  {
    key: "photo-opportunities",
    title: "Photo Opportunities",
    description: "All necessary photos will be taken, including ones with the birthday child, family, groups, and even alone.",
    icon: Camera,
    image: photoOpportunitiesImage,
  },
];

/**
 * The same six activities on every listing: a two-column card grid on desktop, one
 * column on a phone. Each card reads icon, then title and description, then a
 * picture of the moment.
 */
function ActivitySection() {
  return <section aria-labelledby="activity-heading">
    <p className="text-sm font-bold text-primary">Party activities</p>
    <h2 id="activity-heading" className="mt-2 font-display text-2xl font-extrabold">Ideas for the big day</h2>
    <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
      Six ways to make the most of a character visit, from the grand entrance to the last photo.
    </p>
    <ul className="mt-6 grid gap-5 sm:grid-cols-2">
      {ACTIVITIES.map((activity) => {
        const Icon = activity.icon;
        return <li key={activity.key}>
          <article className="group flex h-full items-center gap-3 rounded-2xl border bg-background p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary sm:size-11">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-extrabold">{activity.title}</h3>
              {/* Two lines are always reserved so cards in a row keep the same height. */}
              <p className="mt-1 line-clamp-2 min-h-12 text-sm leading-6 text-muted-foreground">{activity.description}</p>
            </div>
            {/* The title beside it already names the activity, so the picture is decoration. */}
            <img src={activity.image} alt="" className="size-14 shrink-0 rounded-xl object-cover sm:size-20" />
          </article>
        </li>;
      })}
    </ul>
  </section>;
}

export function VendorProfilePage({ vendor }: { vendor: Vendor }) {
  const [quote, setQuote] = useState(false);
  return <main>
    <section className="relative h-[420px] overflow-hidden">
      <img src={vendor.image} onError={imageFallback(vendor.fallbackImage)} alt={vendor.name} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl p-6 text-background">
        <p className="font-bold text-rating">{vendor.category}</p>
        <div className="mt-2 flex items-center gap-4">
          <VendorLogo vendor={vendor} className="size-16 rounded-2xl p-2" />
          <h1 className="font-display text-4xl font-extrabold sm:text-5xl">{vendor.name}</h1>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {vendor.rating > 0 && <Rating value={vendor.rating} reviews={vendor.reviews} />}
          {vendor.location && <span>{vendor.location}</span>}
          {vendor.price > 0 ? <span>From ${vendor.price}</span> : <span className="text-background/80">Price on request</span>}
        </div>
      </div>
    </section>
    <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-6 py-3">
        <Button onClick={() => setQuote(true)}>Request quote</Button>
        {vendor.website && (
          <span className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium">
            {websiteDomain(vendor.website)}
          </span>
        )}
        {vendor.phone && (
          <span className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium">
            {vendor.phone}
          </span>
        )}
      </div>
    </div>
    <div className="mx-auto max-w-7xl px-6 py-12">
      <ActivitySection />
      <section className="mt-14" aria-labelledby="about-heading">
        <h2 id="about-heading" className="font-display text-2xl font-extrabold">About {vendor.name}</h2>
        <p className="mt-4 max-w-3xl whitespace-pre-line text-base leading-8 text-muted-foreground">{vendor.description || "Listed in the Hire Party Characters directory."}</p>
        <p className="mt-6 text-sm text-muted-foreground">Categories: {vendor.categories.join(", ")}</p>
        {vendor.price <= 0 && <p className="mt-4 max-w-3xl text-sm text-muted-foreground">
          This business has not published a starting price, so its card and the search filters never
          guess one. Send a quote request and they will reply with their own pricing.
        </p>}
      </section>
      {vendor.policies && <section className="mt-10" aria-labelledby="policies-heading">
        <h2 id="policies-heading" className="font-display text-2xl font-extrabold">Policies</h2>
        <p className="mt-4 max-w-3xl whitespace-pre-line text-base leading-8 text-muted-foreground">{vendor.policies}</p>
      </section>}
    </div>
    <QuoteDialog vendor={vendor} open={quote} onOpenChange={setQuote} />
    <Footer />
  </main>;
}
