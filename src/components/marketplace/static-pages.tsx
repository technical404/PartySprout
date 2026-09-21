import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  HelpCircle,
  Mail,
  MapPin,
  PartyPopper,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "./marketplace";
import { fetchCategories, fetchListings } from "@/lib/marketplace-data";
import { LEGAL_LAST_UPDATED, SUPPORT_EMAIL } from "@/lib/site";

/* ------------------------------------------------------------------------- */
/* Shared layout                                                              */
/* ------------------------------------------------------------------------- */

function StaticPage({
  kicker,
  title,
  intro,
  children,
}: {
  kicker: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-surface pb-24">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <p className="font-bold text-primary">{kicker}</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">{intro}</p>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">{children}</div>
      <Footer />
    </main>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return <div className="space-y-5 text-base leading-8 text-muted-foreground">{children}</div>;
}

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 font-display text-2xl font-extrabold text-foreground">{children}</h2>;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <CheckCircle2 className="mt-1.5 size-4 shrink-0 text-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------------- */
/* About                                                                      */
/* ------------------------------------------------------------------------- */

export function AboutPage() {
  const [stats, setStats] = useState({ businesses: 0, categories: 0 });

  useEffect(() => {
    void fetchListings({ pageSize: 1 }).then((data) =>
      setStats((current) => ({ ...current, businesses: data.total })),
    );
    void fetchCategories().then((list) =>
      setStats((current) => ({ ...current, categories: list.length })),
    );
  }, []);

  return (
    <StaticPage
      kicker="About us"
      title="Built by parents who lost a weekend to party planning."
      intro="PartySprout is a directory of children's party entertainers. We help families find, compare and contact local businesses — and we try to be honest about what we are and what we are not."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Businesses listed", value: stats.businesses ? `${stats.businesses}+` : "—" },
          { label: "Categories", value: stats.categories ? String(stats.categories) : "—" },
          { label: "Cities covered", value: "20+" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-background p-5">
            <p className="font-display text-3xl font-extrabold">{stat.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <Heading>What we do</Heading>
      <Prose>
        <p>
          We collect children&rsquo;s party businesses — superheroes, princesses, mascots,
          magicians, clowns, pirates and more — into one searchable place. Every listing shows the
          things that actually decide a booking: the starting price, the city served, the rating,
          and a link straight to the business&rsquo;s own website.
        </p>
        <p>
          You can browse by category or city, save a shortlist, compare businesses side by side, and
          send one quote request that reaches every entertainer who fits your date.
        </p>
      </Prose>

      <Heading>What we are not</Heading>
      <Prose>
        <p>
          PartySprout is a directory, not a booking agency. We do not employ entertainers, we do not
          take payment on their behalf, and we do not handle your booking. When you hire someone,
          your agreement is directly with that business — which is also why we always link to their
          own website and phone number.
        </p>
        <p>
          Directory details come from public business listings and are refreshed periodically. If
          you spot something out of date, tell us and we will fix it.
        </p>
      </Prose>

      <Heading>How we choose what to show</Heading>
      <Bullets
        items={[
          "Listings are shown in a neutral order by default — featured businesses are labelled as such, never disguised.",
          "Starting prices come from the business's published information. Always confirm the final quote with them.",
          "Ratings and review counts are the business's own public figures, shown with the source count so you can weigh them.",
          "We do not sell ranking. A business cannot pay to appear higher without the featured label being visible.",
        ]}
      />

      <div className="mt-12 flex flex-wrap gap-3">
        <Button size="lg" asChild>
          <Link to="/search" search={{ q: "", location: "" }}>
            <Search />
            Find entertainers
          </Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link to="/contact">Contact us</Link>
        </Button>
      </div>
    </StaticPage>
  );
}

/* ------------------------------------------------------------------------- */
/* Contact                                                                    */
/* ------------------------------------------------------------------------- */

export function ContactPage() {
  return (
    <StaticPage
      kicker="Contact us"
      title="Talk to a human."
      intro="Questions about the directory, a listing that needs correcting, or something not working? Here is how to reach us."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="group flex items-start gap-4 rounded-lg border bg-background p-6 transition hover:border-primary/40 hover:shadow-lg"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <Mail className="size-5" />
          </span>
          <span>
            <b className="block font-display text-lg font-extrabold">Email us</b>
            <span className="mt-1 block text-sm text-muted-foreground">{SUPPORT_EMAIL}</span>
            <span className="mt-2 block text-xs font-semibold text-primary">
              We usually reply within one working day.
            </span>
          </span>
        </a>

        <div className="flex items-start gap-4 rounded-lg border bg-background p-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <Clock3 className="size-5" />
          </span>
          <span>
            <b className="block font-display text-lg font-extrabold">Support hours</b>
            <span className="mt-1 block text-sm text-muted-foreground">
              Monday to Friday, 9am – 5pm Central.
            </span>
            <span className="mt-2 block text-xs font-semibold text-muted-foreground">
              Party enquiries are answered by the entertainers themselves.
            </span>
          </span>
        </div>
      </div>

      <Heading>Planning a party?</Heading>
      <Prose>
        <p>
          If you are looking for an entertainer, you do not need to contact us — the fastest route
          is to send a quote request. It reaches every business that covers your city and date, and
          they reply to you directly.
        </p>
      </Prose>
      <div className="mt-6">
        <Button size="lg" asChild>
          <Link to="/request-quote">
            <Send />
            Request a quote
          </Link>
        </Button>
      </div>

      <Heading>List your business</Heading>
      <Prose>
        <p>
          Run a children&rsquo;s party business? Tell us the business name, the city you serve and
          your website, and we will review it for the directory. Listing is free while we grow, and
          featured placement is never sold without being clearly labelled.
        </p>
      </Prose>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <Link to="/vendor/profile">
            <Building2 />
            Add your business
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/how-it-works">
            <HelpCircle />
            How it works
          </Link>
        </Button>
      </div>

      <Heading>Reporting a problem</Heading>
      <Prose>
        <p>
          If a listing has wrong details, a price that has changed, or a phone number that no longer
          works, email us with the business name and the city. Include a link if you have one — it
          makes the fix much faster.
        </p>
      </Prose>
    </StaticPage>
  );
}

/* ------------------------------------------------------------------------- */
/* How it works                                                              */
/* ------------------------------------------------------------------------- */

const PARENT_STEPS = [
  {
    Icon: Search,
    title: "1. Search or browse",
    copy: "Start from a category like superheroes or a city like Dallas. Filter by price and what the party needs.",
  },
  {
    Icon: ArrowLeftRight,
    title: "2. Compare shortlisted businesses",
    copy: "Save the ones you like and compare them side by side — starting price, rating, location and website.",
  },
  {
    Icon: Send,
    title: "3. Send one quote request",
    copy: "Fill in the party details once. Your request reaches every entertainer who can serve your date and city.",
  },
  {
    Icon: CalendarCheck,
    title: "4. Book the one that fits",
    copy: "Reply to whoever feels right. You agree the booking and payment directly with the business.",
  },
  {
    Icon: PartyPopper,
    title: "5. Celebrate",
    copy: "The entertainer handles the party. You take the photos and enjoy it.",
  },
];

export function HowItWorksPage() {
  return (
    <StaticPage
      kicker="How it works"
      title="From search to celebration, in five steps."
      intro="PartySprout is designed to remove the awkward part of hiring an entertainer: emailing strangers one by one and guessing what anything costs."
    >
      <ol className="space-y-4">
        {PARENT_STEPS.map(({ Icon, title, copy }) => (
          <li key={title} className="flex gap-4 rounded-lg border bg-background p-6">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Icon className="size-5" />
            </span>
            <span>
              <b className="block font-display text-lg font-extrabold">{title}</b>
              <span className="mt-2 block leading-7 text-muted-foreground">{copy}</span>
            </span>
          </li>
        ))}
      </ol>

      <Heading>For parents</Heading>
      <Bullets
        items={[
          "No account is required to search, compare or send a quote request.",
          "Starting prices are shown up front, so you can filter before you talk to anyone.",
          "One request reaches multiple businesses — you are not locked into a single quote.",
          "You book and pay the business directly. We never take a cut of your booking.",
        ]}
      />

      <Heading>For entertainers</Heading>
      <Bullets
        items={[
          "Get listed with your name, city, phone number and website linked, so families can reach you directly.",
          "Quote requests arrive with the date, city, guest count and budget already filled in.",
          "There is no commission on bookings made through the directory.",
          "Featured placement is optional and always labelled, never disguised as organic ranking.",
        ]}
      />

      <Heading>Common questions</Heading>
      <div className="space-y-4">
        {[
          {
            q: "Is PartySprout free to use?",
            a: "Yes. Browsing, comparing and sending quote requests costs nothing for families.",
          },
          {
            q: "Do you check the entertainers?",
            a: "We list businesses from public directory data and show their public rating and review count. We do not run background checks, so we recommend confirming insurance and references directly with any business you hire.",
          },
          {
            q: "How long until I hear back?",
            a: "Entertainers reply directly, usually within one to two days. If a request gets no replies, email us and we will help.",
          },
          {
            q: "What if the price differs from the listing?",
            a: "The figure shown is the business's published starting price, not a quote. Final pricing depends on your date, travel distance and how long you need them.",
          },
        ].map((item) => (
          <div key={item.q} className="rounded-lg border bg-background p-6">
            <b className="block font-display text-base font-extrabold">{item.q}</b>
            <p className="mt-2 leading-7 text-muted-foreground">{item.a}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap gap-3">
        <Button size="lg" asChild>
          <Link to="/request-quote">
            <Sparkles />
            Request a quote
          </Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link to="/explore">
            <Users />
            Explore categories
          </Link>
        </Button>
      </div>
    </StaticPage>
  );
}

/* ------------------------------------------------------------------------- */
/* Terms and privacy                                                          */
/* ------------------------------------------------------------------------- */

/**
 * Template legal copy. It describes how this directory actually behaves, but it
 * has not been reviewed by a lawyer — have it checked before launch.
 */
const TERMS_SECTIONS = [
  {
    title: "1. What PartySprout is",
    body: [
      "PartySprout operates a directory of children's party entertainment businesses. We publish information about those businesses and provide tools to contact them.",
      "We are not a party agent, booking platform or payment processor. We are not a party to any agreement you make with a business listed here, and we take no commission on it.",
    ],
  },
  {
    title: "2. Listings and accuracy",
    body: [
      "Business details, starting prices, ratings and review counts come from public sources and the businesses themselves, and are refreshed periodically.",
      "We do not guarantee that any listing is accurate, complete or current. Prices change, businesses move and phone numbers get reassigned. Always confirm the details directly with the business before you book.",
    ],
  },
  {
    title: "3. Your responsibilities",
    body: [
      "You agree to use PartySprout only for lawful purposes and to provide accurate information when you submit a quote request.",
      "You are responsible for making your own decision about which business to hire, and for any agreement, payment or safety arrangement you enter into with them.",
    ],
  },
  {
    title: "4. Bookings are between you and the business",
    body: [
      "We do not supervise, vet, insure or employ the businesses listed. We do not run background checks. Where a business advertises a credential, you should verify it with the business or the issuing body.",
      "Any dispute about a booking — including quality, cancellations, refunds or damage — is between you and that business.",
    ],
  },
  {
    title: "5. Quote requests",
    body: [
      "When you submit a quote request, the details you provide (including your name, email, phone number and party requirements) are passed to relevant businesses so they can reply to you.",
      "This is the purpose of the form. Do not submit information you are not willing to share with those businesses.",
    ],
  },
  {
    title: "6. Website content and intellectual property",
    body: [
      "The PartySprout name, design and original written content belong to us. Business names, logos, photographs and website icons belong to their respective owners and are shown for identification purposes.",
      "If you believe content on this site infringes your rights, contact us and we will review and remove it where appropriate.",
    ],
  },
  {
    title: "7. Availability and liability",
    body: [
      'We aim to keep the directory available and correct, but we provide it on an "as is" basis without warranties of any kind.',
      "To the extent permitted by law, we are not liable for indirect or consequential loss arising from your use of the directory or from any dealing you have with a listed business.",
    ],
  },
  {
    title: "8. Changes and governing law",
    body: [
      "We may update these terms as the service changes. The date at the top of this page shows the last revision.",
      "These terms are governed by the laws of the jurisdiction in which PartySprout operates, and this template should be adapted to the correct jurisdiction before launch.",
    ],
  },
];

const PRIVACY_SECTIONS = [
  {
    title: "1. What we collect",
    body: [
      "Search and browsing happen without an account, and we do not require you to identify yourself to browse.",
      "When you submit a quote request we collect the details you type in: your name, email address, phone number, party city, event date, guest count, age range, chosen category, budget and message.",
    ],
  },
  {
    title: "2. Why we collect it",
    body: [
      "Quote request details are used for one purpose: passing your enquiry to entertainers who can serve your date and city, so they can reply to you.",
      "We also keep basic, aggregated usage information to understand which parts of the directory are useful.",
    ],
  },
  {
    title: "3. Who sees your details",
    body: [
      "Your quote request details are shared with the relevant listed businesses so they can respond. If you requested a quote from a specific business, that business is included.",
      "We do not sell your personal information, and we do not share it with third parties for advertising.",
    ],
  },
  {
    title: "4. Cookies and local storage",
    body: [
      "The directory uses minimal browser storage to keep interface preferences such as saved shortlists working.",
      "We do not use third-party advertising cookies. If you disable storage, searching and browsing still work.",
    ],
  },
  {
    title: "5. Third-party content",
    body: [
      "Listing pages and cards may load images and icons directly from the business's own website. When those images load, your browser makes a request to that site, which may see your IP address and browser information.",
      "Links to business websites take you to sites we do not control and whose privacy practices are their own.",
    ],
  },
  {
    title: "6. How long we keep it",
    body: [
      "Quote requests are kept for as long as needed to handle your enquiry and to keep a record of the businesses that were contacted.",
      "You can ask us to delete a quote request you submitted at any time.",
    ],
  },
  {
    title: "7. Your choices",
    body: [
      "You can ask us what personal information we hold about you, ask for a copy, ask for corrections, or ask us to delete it.",
      "Contact us using the address below and we will respond within a reasonable period.",
    ],
  },
  {
    title: "8. Children's privacy",
    body: [
      "PartySprout is intended for use by adults arranging parties. We do not knowingly collect personal information about children; information about guests should be described in general terms only, for example an age range or a headcount.",
    ],
  },
];

function LegalPage({
  kicker,
  title,
  intro,
  sections,
}: {
  kicker: string;
  title: string;
  intro: string;
  sections: Array<{ title: string; body: string[] }>;
}) {
  return (
    <StaticPage kicker={kicker} title={title} intro={intro}>
      <p className="rounded-lg border border-rating/40 bg-rating/10 p-4 text-sm leading-7">
        <b>Template notice.</b> This page describes how PartySprout actually behaves, but it is
        sample wording written for this project — it has not been reviewed by a lawyer. Have it
        checked and adapted to your jurisdiction before relying on it.
      </p>

      <p className="mt-6 text-sm font-semibold text-muted-foreground">
        Last updated: {LEGAL_LAST_UPDATED}
      </p>

      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="font-display text-xl font-extrabold text-foreground">{section.title}</h2>
            <Prose>
              {section.body.map((paragraph) => (
                <p key={paragraph.slice(0, 40)}>{paragraph}</p>
              ))}
            </Prose>
          </section>
        ))}
      </div>

      <div className="mt-12 rounded-lg border bg-background p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
          <ShieldCheck className="size-5 text-trust" />
          Questions about this page
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Email{" "}
          <a className="font-semibold text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          and we will help. For party enquiries, use the{" "}
          <Link className="font-semibold text-primary underline" to="/request-quote">
            quote request form
          </Link>
          .
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <Link to="/contact">
            <MapPin />
            Contact us
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/how-it-works">How it works</Link>
        </Button>
      </div>
    </StaticPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage
      kicker="Terms"
      title="Terms of use"
      intro="The ground rules for using the PartySprout directory, and what we are and are not responsible for."
      sections={TERMS_SECTIONS}
    />
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      kicker="Privacy"
      title="Privacy policy"
      intro="What we collect when you browse or send a quote request, why we collect it, and who sees it."
      sections={PRIVACY_SECTIONS}
    />
  );
}
