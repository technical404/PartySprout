import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer, QuoteDialog, Rating, SearchPanel, VendorLogo } from "./marketplace";
import {
  BrowseByCitySection, CelebrationJourneySection, FeaturedCarouselSection,
  GeneralQuoteCta, PopularEntertainmentSection,
} from "./home-sections";
import { fetchCategories, fetchCities, fetchListings, type Category, type City, type Vendor } from "@/lib/marketplace-data";
import { SUPPORT_EMAIL } from "@/lib/site";
import heroImage from "@/assets/party-hero.jpg";

/**
 * Marketing and browsing pages. The account, vendor, admin, saved, compare,
 * quote and party-builder screens live in their own modules so each file stays
 * about one job.
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
  return <main><div className="bg-surface py-14"><div className="mx-auto max-w-7xl px-6"><p className="font-bold text-primary">Explore every possibility</p><h1 className="mt-2 font-display text-4xl font-extrabold">What will make them light up?</h1><div className="mt-7 max-w-4xl"><SearchPanel compact /></div></div></div><Section title="Featured categories" kicker="The most-loved ways to celebrate"><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{primaryCategories.map((category)=><Link key={category.slug} to="/category/$slug" params={{slug:category.slug}} className="group grid grid-cols-[120px_1fr] overflow-hidden rounded-lg border bg-background"><img src={category.image} alt={category.name} className="h-full min-h-32 w-full object-cover transition group-hover:scale-105"/><div className="p-5"><h2 className="font-display text-xl font-extrabold">{category.name}</h2><p className="mt-2 text-sm text-muted-foreground">{category.description}</p><p className="mt-4 text-xs font-bold text-primary">{category.count} entertainers</p></div></Link>)}</div></Section><Footer/></main>; }

export function VendorProfilePage({ vendor }: { vendor: Vendor }) {
  const [quote, setQuote] = useState(false);
  return <main>
    <section className="relative h-[420px] overflow-hidden">
      <img src={vendor.image} alt={vendor.name} className="h-full w-full object-cover" />
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
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-6 py-3">
        <Button onClick={() => setQuote(true)}>Request quote</Button>
        {vendor.website && <Button variant="outline" asChild><a href={vendor.website} target="_blank" rel="noreferrer">Website</a></Button>}
        {vendor.phone && <Button variant="outline" asChild><a href={`tel:${vendor.phone}`}>{vendor.phone}</a></Button>}
        <Button variant="ghost" asChild><Link to="/compare">Compare</Link></Button>
      </div>
    </div>
    <div className="mx-auto max-w-7xl px-6 py-12">
      <h2 className="font-display text-2xl font-extrabold">About {vendor.name}</h2>
      <p className="mt-4 max-w-3xl whitespace-pre-line text-base leading-8 text-muted-foreground">{vendor.description || "Listed in the PartySprout directory."}</p>
      <p className="mt-6 text-sm text-muted-foreground">Categories: {vendor.categories.join(", ")}</p>
      {vendor.price <= 0 && <p className="mt-4 max-w-3xl text-sm text-muted-foreground">
        This business has not published a starting price, so its card and the search filters never
        guess one. Send a quote request and they will reply with their own pricing.
      </p>}
    </div>
    <QuoteDialog vendor={vendor} open={quote} onOpenChange={setQuote} />
    <Footer />
  </main>;
}
