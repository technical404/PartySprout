import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  Building2,
  CheckCheck,
  Clock3,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTROL_CLASS } from "@/components/ui/control";
import { Input } from "@/components/ui/input";
import { Footer } from "./footer";
import { LoginPanel } from "./account-pages";
import { CategoriesSection, ListingsSection, QuotesSection, UsersSection } from "./admin-console";
import { StatusChip } from "./vendor-pages";
import { api, type OwnedListing } from "@/lib/api";
import { useSession } from "@/lib/session";

type TabKey = "dashboard" | "queue" | "listings" | "accounts" | "categories" | "quotes";

const TABS: Array<{ key: TabKey; label: string; hint: string }> = [
  { key: "dashboard", label: "Dashboard", hint: "Counts across the whole directory" },
  { key: "queue", label: "Review queue", hint: "Submissions waiting for a decision" },
  { key: "listings", label: "Listings", hint: "Search, edit, feature and delete businesses" },
  { key: "accounts", label: "Accounts", hint: "Roles, suspensions and passwords" },
  { key: "categories", label: "Categories", hint: "Names, taglines and specialty labels" },
  { key: "quotes", label: "Quote requests", hint: "What parents have asked for" },
];

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | undefined;
  hint?: string | undefined;
}) {
  return (
    <div className="rounded-lg border bg-background p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-extrabold">{value ?? "—"}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  copy,
}: {
  icon: typeof ShieldCheck;
  title: string;
  copy: string;
}) {
  return (
    <div className="flex-1 rounded-lg border bg-background p-5">
      <Icon className="size-5 text-primary" />
      <h3 className="mt-3 font-display text-base font-extrabold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
    </div>
  );
}

/**
 * The admin console. Approving a submission is still the only way a listing
 * becomes public, and everything here reads and writes real rows.
 */
export function AdminPage() {
  const { user, loading, refresh } = useSession();
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [byStatus, setByStatus] = useState<Array<{ status: string; total: number }>>([]);
  const [queue, setQueue] = useState<OwnedListing[]>([]);
  const [queueTab, setQueueTab] = useState<"pending" | "active" | "rejected">("pending");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    const summary = await api.adminStats();
    if (summary.ok) {
      setStats(summary.data.stats ?? null);
      setByStatus(summary.data.byStatus ?? []);
    } else setError(summary.message);
  }, []);

  const loadQueue = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await api.adminSubmissions(queueTab);
    if (result.ok) setQueue(result.data.items ?? []);
    else setError(result.message);
    setBusy(false);
  }, [queueTab]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    void loadStats();
  }, [user, loadStats]);

  useEffect(() => {
    if (!user || user.role !== "admin" || tab !== "queue") return;
    void loadQueue();
  }, [user, tab, loadQueue]);

  async function review(id: number, status: "active" | "rejected" | "pending") {
    setBusy(true);
    const result = await api.reviewListing(id, status, status === "rejected" ? note : "");
    if (!result.ok) setError(result.message);
    setNote("");
    await loadQueue();
    await loadStats();
  }

  if (loading)
    return (
      <main className="grid min-h-screen place-items-center bg-surface">
        <p className="text-muted-foreground">Checking your account...</p>
      </main>
    );

  if (!user || user.role !== "admin") {
    return (
      <main className="min-h-screen bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <p className="font-bold text-primary">Administration</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold">Admin sign-in</h1>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            {user
              ? "This account is not an admin, so there is nothing to show here."
              : "Admins review new business submissions. This screen is the only way a listing becomes public."}
          </p>
          {!user && (
            <div className="mt-8">
              <LoginPanel note="Sign in with an admin account." onDone={() => void refresh()} />
            </div>
          )}
          {user && (
            <Button className="mt-6" variant="outline" asChild>
              <Link to="/account">Go to my account</Link>
            </Button>
          )}
        </div>
        <Footer />
      </main>
    );
  }

  const pending = byStatus.find((row) => row.status === "pending")?.total ?? 0;

  return (
    <main className="min-h-screen bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-primary">Administration</p>
            <h1 className="font-display text-3xl font-extrabold">
              {TABS.find((row) => row.key === tab)?.label ?? "Console"}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {pending === 0
                ? "Nothing waiting for review."
                : `${pending} submission${pending === 1 ? "" : "s"} waiting for a decision.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadStats()} disabled={busy}>
              <Loader2 className={busy ? "animate-spin" : "hidden"} />
              Refresh counts
            </Button>
            <Button variant="outline" asChild>
              <Link to="/search" search={{ q: "", location: "" }}>
                Open the directory
              </Link>
            </Button>
          </div>
        </div>

        <nav className="mt-8 flex flex-wrap gap-2" aria-label="Admin sections">
          {TABS.map((row) => (
            <button
              key={row.key}
              type="button"
              title={row.hint}
              onClick={() => setTab(row.key)}
              className={`rounded-full border px-4 py-2 text-sm font-bold ${
                tab === row.key
                  ? "border-primary bg-primary-soft text-primary"
                  : "bg-background text-muted-foreground"
              }`}
            >
              {row.label}
              {row.key === "queue" && pending > 0 && (
                <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  {pending}
                </span>
              )}
            </button>
          ))}
        </nav>

        {error && (
          <p className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-8">
          {tab === "dashboard" && (
            <section>
              <h2 className="font-display text-2xl font-extrabold">Directory at a glance</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Real counters, straight from the database.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Live listings" value={stats?.["listings"]} hint="Visible in search" />
                <Stat label="Pending" value={stats?.["pending"]} hint="Awaiting a decision" />
                <Stat label="Rejected" value={stats?.["rejected"]} hint="Hidden from search" />
                <Stat
                  label="Quote requests"
                  value={stats?.["quoteRequests"]}
                  hint={`${stats?.["quotesLast7Days"] ?? 0} in the last 7 days`}
                />
                <Stat label="Accounts" value={stats?.["users"]} />
                <Stat label="Vendor accounts" value={stats?.["vendors"]} />
                <Stat label="Saved businesses" value={stats?.["favorites"]} />
                <Stat label="Cities" value={stats?.["cities"]} />
              </div>
              <div className="mt-8 flex flex-wrap gap-4">
                <Card
                  icon={ShieldCheck}
                  title="What approval does"
                  copy="Approving sets the listing live, so it appears in search and at its own URL. Rejecting keeps it hidden and stores your note for the vendor."
                />
                <Card
                  icon={Users}
                  title="Who can submit"
                  copy="Any signed-in account can submit a business. Accounts are not pre-approved, so the review queue is the real gate."
                />
                <Card
                  icon={AlertCircle}
                  title="Test data"
                  copy="Rows created by probes and test accounts are real database rows — delete them in the Listings tab if you do not want them."
                />
              </div>
            </section>
          )}

          {tab === "queue" && (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-extrabold">Review queue</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Approve to publish, reject to keep it hidden with a note the vendor sees.
                  </p>
                </div>
                <Button variant="outline" onClick={() => void loadQueue()} disabled={busy}>
                  <Loader2 className={busy ? "animate-spin" : "hidden"} />
                  Refresh
                </Button>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {(["pending", "active", "rejected"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setQueueTab(status)}
                    className={`rounded-full border px-4 py-2 text-sm font-bold ${
                      queueTab === status
                        ? "border-primary bg-primary-soft text-primary"
                        : "bg-background text-muted-foreground"
                    }`}
                  >
                    {status === "pending"
                      ? "Waiting for review"
                      : status === "active"
                        ? "Live"
                        : "Rejected"}
                  </button>
                ))}
              </div>

              {queue.length === 0 ? (
                <p className="mt-5 rounded-lg border bg-background p-6 text-sm text-muted-foreground">
                  Nothing in this list right now.
                </p>
              ) : (
                <ul className="mt-5 space-y-4">
                  {queue.map((listing) => (
                    <li key={listing.id} className="rounded-2xl border bg-background p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <Building2 className="mt-1 size-5 text-primary" />
                          <div>
                            <h3 className="font-display text-xl font-extrabold">{listing.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {[listing.category_name, listing.city_name, listing.state_code]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>
                        <StatusChip status={listing.status ?? "pending"} />
                      </div>

                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <dt className="text-muted-foreground">Website</dt>
                          <dd className="truncate font-semibold">{listing.website ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Phone</dt>
                          <dd className="font-semibold">{listing.phone ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Email</dt>
                          <dd className="truncate font-semibold">{listing.email ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Starting price</dt>
                          <dd className="font-semibold">
                            {listing.price_from ? `$${listing.price_from}` : "Not published"}
                          </dd>
                        </div>
                      </dl>

                      {listing.description && (
                        <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground">
                          {listing.description}
                        </p>
                      )}
                      {listing.review_note && (
                        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                          Previous note: {listing.review_note}
                        </p>
                      )}

                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        {listing.status !== "active" && (
                          <Button onClick={() => void review(listing.id, "active")} disabled={busy}>
                            <CheckCheck />
                            Approve and publish
                          </Button>
                        )}
                        {listing.status !== "rejected" && (
                          <Button
                            variant="outline"
                            onClick={() => void review(listing.id, "rejected")}
                            disabled={busy}
                          >
                            <X />
                            Reject
                          </Button>
                        )}
                        {listing.status !== "pending" && (
                          <Button
                            variant="ghost"
                            onClick={() => void review(listing.id, "pending")}
                            disabled={busy}
                          >
                            <Clock3 />
                            Send back to review
                          </Button>
                        )}
                        {listing.status === "active" && (
                          <Button variant="ghost" asChild>
                            <Link to="/vendors/$slug" params={{ slug: listing.slug }}>
                              <ExternalLink />
                              View public page
                            </Link>
                          </Button>
                        )}
                      </div>

                      {listing.status !== "active" && (
                        <label className="mt-4 grid max-w-xl gap-2 text-sm font-semibold">
                          Reviewer note (optional, shown to the vendor)
                          <Input
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Explain what needs changing"
                            className={CONTROL_CLASS}
                          />
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "listings" && <ListingsSection />}
          {tab === "accounts" && <UsersSection />}
          {tab === "categories" && <CategoriesSection />}
          {tab === "quotes" && <QuotesSection />}
        </div>
      </div>
      <Footer />
    </main>
  );
}
