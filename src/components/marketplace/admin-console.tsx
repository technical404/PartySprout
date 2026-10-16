import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Download,
  ExternalLink,
  KeyRound,
  Loader2,
  Pencil,
  Search,
  Star,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTROL_AREA_CLASS, CONTROL_CLASS } from "@/components/ui/control";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  api,
  type AdminCategory,
  type AdminListing,
  type AdminListingInput,
  type AdminPage,
  type ApiResult,
  type AdminUser,
} from "@/lib/api";
import { formatDate } from "@/lib/dates";
import type { QuoteRequestRow } from "@/lib/marketplace-data";
import { StatusChip } from "./vendor-pages";

const PAGE_SIZE = 25;
const ALL = "all";

/* ------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* ------------------------------------------------------------------------- */

/** Keeps the search box from firing a request per keystroke. */
function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      <span>
        {label}
        {hint && <span className="ml-2 font-normal text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        {total === 0
          ? "Nothing to show."
          : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="text-muted-foreground">
          Page {page} of {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function Notice({ error, busy, message }: { error: string | null; busy: boolean; message?: string | null }) {
  return (
    <>
      {error && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p className="mt-4 rounded-lg border border-success/30 bg-success-soft p-4 text-sm font-semibold text-success">
          {message}
        </p>
      )}
      {busy && (
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Working…
        </p>
      )}
    </>
  );
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const first = rows[0];
  if (!first) return;
  const headers = Object.keys(first);
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => escape(row[key])).join(",")),
  ];
  const blob = new Blob([body.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export is for "everything that matches", not just the page on screen, so the
 * rows are walked a page at a time until the server says the list is exhausted.
 */
async function collectAll<T>(
  fetchPage: (page: number) => Promise<ApiResult<AdminPage<T>>>,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 40; page += 1) {
    const result = await fetchPage(page);
    if (!result.ok) break;
    out.push(...result.data.items);
    if (out.length >= result.data.total || result.data.items.length === 0) break;
  }
  return out;
}

function ConfirmDelete({
  open,
  title,
  description,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={busy}
          >
            {busy ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function useAdminCategories() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let alive = true;
    void api.adminCategories().then((result) => {
      if (alive && result.ok) setCategories(result.data.items);
    });
    return () => {
      alive = false;
    };
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  return { categories, reload };
}

/* ------------------------------------------------------------------------- */
/* Listings                                                                   */
/* ------------------------------------------------------------------------- */

/** A row back into the shape the edit endpoint expects. */
function toInput(listing: AdminListing): AdminListingInput {
  return {
    name: listing.name,
    categorySlug: listing.category_slug,
    cityText: listing.city_name ?? "",
    website: listing.website ?? "",
    phone: listing.phone ?? "",
    email: listing.email ?? "",
    priceFrom: listing.price_from === null ? "" : String(listing.price_from),
    description: listing.description ?? "",
    policies: listing.policies ?? "",
    status: listing.status,
    isFeatured: listing.is_featured === 1,
    pinRank: listing.pin_rank,
    reviewNote: listing.review_note ?? "",
  };
}

export function ListingsSection() {
  const { categories } = useAdminCategories();
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term);
  const [status, setStatus] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminPage<AdminListing> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminListing | null>(null);
  const [deleting, setDeleting] = useState<AdminListing | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await api.adminListings({
      q: debounced,
      status: status === ALL ? "" : status,
      category: category === ALL ? "" : category,
      sort,
      page,
      pageSize: PAGE_SIZE,
    });
    if (result.ok) setData(result.data);
    else setError(result.message);
    setBusy(false);
  }, [debounced, status, category, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFeatured(listing: AdminListing) {
    const result = await api.adminUpdateListing(listing.id, {
      ...toInput(listing),
      isFeatured: listing.is_featured !== 1,
    });
    if (!result.ok) setError(result.message);
    else await load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const result = await api.adminDeleteListing(deleting.id);
    setBusy(false);
    setDeleting(null);
    if (!result.ok) setError(result.message);
    else await load();
  }

  async function exportCsv() {
    setExporting(true);
    const rows = await collectAll((nextPage) =>
      api.adminListings({
        q: debounced,
        status: status === ALL ? "" : status,
        category: category === ALL ? "" : category,
        sort,
        page: nextPage,
        pageSize: 100,
      }),
    );
    setExporting(false);
    downloadCsv(
      "listings.csv",
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        category: row.category_name,
        status: row.status,
        featured: row.is_featured === 1 ? "yes" : "no",
        pin_rank: row.pin_rank,
        city: row.city_name ?? "",
        state: row.state_code ?? "",
        website: row.website ?? "",
        email: row.email ?? "",
        phone: row.phone ?? "",
        price_from: row.price_from ?? "",
        rating: row.rating ?? "",
        review_count: row.review_count ?? "",
        created_at: row.created_at,
      })),
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-extrabold">Listings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every business in the directory, whatever its review status. Approving one is what makes
            it public.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting}>
            <Download />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={busy}>
            <Loader2 className={busy ? "animate-spin" : "hidden"} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className={`${CONTROL_CLASS} pl-10`}
            placeholder="Name, website, email or slug"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className={CONTROL_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            <SelectItem value="active">Live</SelectItem>
            <SelectItem value="pending">Waiting for review</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={category}
          onValueChange={(value) => {
            setCategory(value);
            setPage(1);
          }}
        >
          <SelectTrigger className={CONTROL_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any category</SelectItem>
            {categories.map((row) => (
              <SelectItem key={row.id} value={row.slug}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(value) => {
            setSort(value);
            setPage(1);
          }}
        >
          <SelectTrigger className={CONTROL_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="featured">Featured first</SelectItem>
            <SelectItem value="price_desc">Price, high to low</SelectItem>
            <SelectItem value="price_asc">Price, low to high</SelectItem>
            <SelectItem value="rating">Rating</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Notice error={error} busy={busy} />

      {data && (
        <>
          <div className="mt-5 overflow-x-auto rounded-2xl border bg-background">
            <Table className="min-w-[960px]">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-bold">Business</TableHead>
                  <TableHead className="font-bold">Category</TableHead>
                  <TableHead className="font-bold">Status</TableHead>
                  <TableHead className="font-bold">Featured</TableHead>
                  <TableHead className="font-bold">Price</TableHead>
                  <TableHead className="font-bold">City</TableHead>
                  <TableHead className="font-bold">Added</TableHead>
                  <TableHead className="text-right font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((listing) => (
                  <TableRow key={listing.id}>
                    <TableCell>
                      <span className="block font-semibold">{listing.name}</span>
                      <span className="block text-xs text-muted-foreground">/{listing.slug}</span>
                    </TableCell>
                    <TableCell>{listing.category_name}</TableCell>
                    <TableCell>
                      <StatusChip status={listing.status} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-pressed={listing.is_featured === 1}
                        aria-label={
                          listing.is_featured === 1 ? "Remove from featured" : "Mark as featured"
                        }
                        onClick={() => void toggleFeatured(listing)}
                      >
                        <Star
                          className={
                            listing.is_featured === 1
                              ? "fill-primary text-primary"
                              : "text-muted-foreground"
                          }
                        />
                      </Button>
                    </TableCell>
                    <TableCell>
                      {listing.price_from === null ? "—" : `$${listing.price_from}`}
                    </TableCell>
                    <TableCell>
                      {[listing.city_name, listing.state_code].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(listing.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {listing.status === "active" && (
                          <Button variant="ghost" size="sm" asChild>
                            <Link to="/vendors/$slug" params={{ slug: listing.slug }}>
                              <ExternalLink />
                            </Link>
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setEditing(listing)}>
                          <Pencil />
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(listing)}>
                          <Trash2 className="text-destructive" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="p-6 text-center text-muted-foreground">
                      No listings match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}

      {editing && (
        <ListingDialog
          listing={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      <ConfirmDelete
        open={deleting !== null}
        title="Delete this listing?"
        description={`"${deleting?.name ?? ""}" is removed from the directory for good. Any quote requests sent to it are kept, but no longer point at a business.`}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}

function ListingDialog({
  listing,
  categories,
  onClose,
  onSaved,
}: {
  listing: AdminListing;
  categories: AdminCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<AdminListingInput>(() => toInput(listing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  function set<K extends keyof AdminListingInput>(key: K, value: AdminListingInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setFields({});
    const result = await api.adminUpdateListing(listing.id, form);
    setBusy(false);
    if (result.ok) onSaved();
    else {
      setError(result.message);
      setFields(result.fields ?? {});
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit {listing.name}</DialogTitle>
          <DialogDescription>
            Changes go live immediately. A city that matches a real one is linked to it, so state
            searches keep working.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            <Input
              className={CONTROL_CLASS}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={Boolean(fields["name"])}
            />
            {fields["name"] && (
              <span className="text-xs font-normal text-destructive">{fields["name"]}</span>
            )}
          </Field>
          <Field label="Category">
            <Select value={form.categorySlug} onValueChange={(value) => set("categorySlug", value)}>
              <SelectTrigger className={CONTROL_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((row) => (
                  <SelectItem key={row.id} value={row.slug}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fields["categorySlug"] && (
              <span className="text-xs font-normal text-destructive">{fields["categorySlug"]}</span>
            )}
          </Field>
          <Field label="City">
            <Input
              className={CONTROL_CLASS}
              value={form.cityText}
              onChange={(e) => set("cityText", e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(value) => set("status", value)}>
              <SelectTrigger className={CONTROL_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Live</SelectItem>
                <SelectItem value="pending">Waiting for review</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Website">
            <Input
              className={CONTROL_CLASS}
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
              aria-invalid={Boolean(fields["website"])}
            />
            {fields["website"] && (
              <span className="text-xs font-normal text-destructive">{fields["website"]}</span>
            )}
          </Field>
          <Field label="Booking email">
            <Input
              className={CONTROL_CLASS}
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              aria-invalid={Boolean(fields["email"])}
            />
            {fields["email"] && (
              <span className="text-xs font-normal text-destructive">{fields["email"]}</span>
            )}
          </Field>
          <Field label="Phone">
            <Input
              className={CONTROL_CLASS}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              aria-invalid={Boolean(fields["phone"])}
            />
            {fields["phone"] && (
              <span className="text-xs font-normal text-destructive">{fields["phone"]}</span>
            )}
          </Field>
          <Field label="Starting price" hint="blank = price on request">
            <Input
              className={CONTROL_CLASS}
              value={form.priceFrom}
              onChange={(e) => set("priceFrom", e.target.value)}
              aria-invalid={Boolean(fields["priceFrom"])}
            />
            {fields["priceFrom"] && (
              <span className="text-xs font-normal text-destructive">{fields["priceFrom"]}</span>
            )}
          </Field>
          <Field label="Pin rank" hint="0 = normal, higher sorts first">
            <Input
              className={CONTROL_CLASS}
              inputMode="numeric"
              value={String(form.pinRank)}
              onChange={(e) => set("pinRank", Number(e.target.value.replace(/\D/g, "")) || 0)}
              aria-invalid={Boolean(fields["pinRank"])}
            />
            {fields["pinRank"] && (
              <span className="text-xs font-normal text-destructive">{fields["pinRank"]}</span>
            )}
          </Field>
          <div className="flex items-center justify-between rounded-xl border p-4">
            <div>
              <p className="text-sm font-semibold">Featured</p>
              <p className="text-xs text-muted-foreground">
                Leads its category in every sort order.
              </p>
            </div>
            <Switch
              checked={form.isFeatured}
              onCheckedChange={(checked) => set("isFeatured", checked)}
            />
          </div>
        </div>

        <Field label="Description" hint="what the business offers">
          <Textarea
            className={CONTROL_AREA_CLASS}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            aria-invalid={Boolean(fields["description"])}
          />
          {fields["description"] && (
            <span className="text-xs font-normal text-destructive">{fields["description"]}</span>
          )}
        </Field>
        <Field label="Policies" hint="deposits, cancellation and travel terms">
          <Textarea
            className={CONTROL_AREA_CLASS}
            value={form.policies}
            onChange={(e) => set("policies", e.target.value)}
            aria-invalid={Boolean(fields["policies"])}
          />
          {fields["policies"] && (
            <span className="text-xs font-normal text-destructive">{fields["policies"]}</span>
          )}
        </Field>
        <Field label="Reviewer note" hint="shown to the submitter when rejected">
          <Input
            className={CONTROL_CLASS}
            value={form.reviewNote}
            onChange={(e) => set("reviewNote", e.target.value)}
            aria-invalid={Boolean(fields["reviewNote"])}
          />
          {fields["reviewNote"] && (
            <span className="text-xs font-normal text-destructive">{fields["reviewNote"]}</span>
          )}
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------- */
/* Accounts                                                                   */
/* ------------------------------------------------------------------------- */

export function UsersSection() {
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term);
  const [role, setRole] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminPage<AdminUser> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [passwordFor, setPasswordFor] = useState<AdminUser | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);
  // Confirms a change whose own dialog has just closed (a new password, a new account).
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await api.adminUsers({
      q: debounced,
      role: role === ALL ? "" : role,
      status: status === ALL ? "" : status,
      page,
      pageSize: PAGE_SIZE,
    });
    if (result.ok) setData(result.data);
    else setError(result.message);
    setBusy(false);
  }, [debounced, role, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function quickChange(user: AdminUser, changes: { role?: string; status?: string }) {
    setNotice(null);
    const nextRole = changes.role ?? user.role;
    const nextStatus = changes.status ?? user.status;
    const result = await api.adminUpdateUser(user.id, {
      name: user.name,
      phone: user.phone ?? "",
      role: nextRole,
      status: nextStatus,
    });
    if (!result.ok) setError(result.message);
    else await load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setNotice(null);
    const result = await api.adminDeleteUser(deleting.id);
    setBusy(false);
    setDeleting(null);
    if (!result.ok) setError(result.message);
    else await load();
  }

  async function exportCsv() {
    const rows = await collectAll((nextPage) =>
      api.adminUsers({
        q: debounced,
        role: role === ALL ? "" : role,
        status: status === ALL ? "" : status,
        page: nextPage,
        pageSize: 100,
      }),
    );
    downloadCsv(
      "accounts.csv",
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone ?? "",
        role: row.role,
        status: row.status,
        listing: row.listing_name ?? "",
        created_at: row.created_at,
      })),
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-extrabold">Accounts</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Parents, vendors and admins. A suspended account cannot sign in; a deleted one loses its
            sessions too.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setNotice(null);
              setCreating(true);
            }}
          >
            <UserPlus />
            New account
          </Button>
          <Button variant="outline" onClick={() => void exportCsv()}>
            <Download />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={busy}>
            <Loader2 className={busy ? "animate-spin" : "hidden"} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className={`${CONTROL_CLASS} pl-10`}
            placeholder="Name or email"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <Select
          value={role}
          onValueChange={(value) => {
            setRole(value);
            setPage(1);
          }}
        >
          <SelectTrigger className={CONTROL_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any role</SelectItem>
            <SelectItem value="parent">Parent</SelectItem>
            <SelectItem value="vendor">Vendor</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className={CONTROL_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Notice error={error} busy={busy} message={notice} />

      {data && (
        <>
          <div className="mt-5 overflow-x-auto rounded-2xl border bg-background">
            <Table className="min-w-[900px]">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-bold">Account</TableHead>
                  <TableHead className="font-bold">Role</TableHead>
                  <TableHead className="font-bold">Status</TableHead>
                  <TableHead className="font-bold">Business</TableHead>
                  <TableHead className="font-bold">Joined</TableHead>
                  <TableHead className="text-right font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <span className="block font-semibold">{user.name}</span>
                      <span className="block text-xs text-muted-foreground">{user.email}</span>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(value) => void quickChange(user, { role: value })}
                      >
                        <SelectTrigger className="h-9 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="parent">Parent</SelectItem>
                          <SelectItem value="vendor">Vendor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.status}
                        onValueChange={(value) => void quickChange(user, { status: value })}
                      >
                        <SelectTrigger className="h-9 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{user.listing_name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(user)}>
                          <Pencil />
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setPasswordFor(user)}>
                          <KeyRound />
                          Password
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(user)}>
                          <Trash2 className="text-destructive" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                      No accounts match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}

      {editing && (
        <UserDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {passwordFor && (
        <PasswordDialog
          user={passwordFor}
          onClose={() => setPasswordFor(null)}
          onSaved={(message) => {
            setPasswordFor(null);
            setNotice(message);
          }}
        />
      )}

      {creating && (
        <CreateUserDialog
          onClose={() => setCreating(false)}
          onSaved={(message) => {
            setCreating(false);
            setNotice(message);
          }}
        />
      )}

      <ConfirmDelete
        open={deleting !== null}
        title="Delete this account?"
        description={`${deleting?.email ?? ""} loses the account and every session. Businesses they submitted stay in the directory, no longer attributed to anyone.`}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}

function UserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const result = await api.adminUpdateUser(user.id, { name, phone, role, status });
    setBusy(false);
    if (result.ok) onSaved();
    else setError(result.message);
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {user.email}</DialogTitle>
          <DialogDescription>
            The email an account signs in with cannot be changed here.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="grid gap-4">
          <Field label="Name">
            <Input
              className={CONTROL_CLASS}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Phone" hint="optional">
            <Input
              className={CONTROL_CLASS}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role">
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className={CONTROL_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className={CONTROL_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Adds an account with any role. Sign-up can only ever create parents, so this is
 * the only place an admin or a vendor is handed out from the UI.
 */
function CreateUserDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("parent");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const missing = 8 - password.length;
  const hint = password.length === 0
    ? "at least 8 characters"
    : missing > 0
      ? `${missing} more character${missing === 1 ? "" : "s"} needed`
      : "long enough";

  async function save() {
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    const result = await api.adminCreateUser({ email, name, phone, role, password });
    setBusy(false);
    if (result.ok) {
      onSaved(`Created ${result.data.user.email} as ${result.data.user.role}. Share the password out of band.`);
      return;
    }
    setError(result.message);
    setFields(result.fields ?? {});
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>
            They sign in with this email and password. Nothing is emailed, so pass the password on
            yourself and ask them to change it.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="grid gap-4">
          <Field label="Email">
            <Input
              className={CONTROL_CLASS}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fields["email"] && (
              <span className="text-xs font-medium text-destructive">{fields["email"]}</span>
            )}
          </Field>
          <Field label="Name">
            <Input
              className={CONTROL_CLASS}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {fields["name"] && (
              <span className="text-xs font-medium text-destructive">{fields["name"]}</span>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role">
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className={CONTROL_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Phone" hint="optional">
              <Input
                className={CONTROL_CLASS}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              {fields["phone"] && (
                <span className="text-xs font-medium text-destructive">{fields["phone"]}</span>
              )}
            </Field>
          </div>
          <Field label="Password" hint={hint}>
            <Input
              className={CONTROL_CLASS}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={missing > 0}
            />
            {fields["password"] && (
              <span className="text-xs font-medium text-destructive">{fields["password"]}</span>
            )}
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || email.trim() === "" || name.trim() === "" || password.length === 0}>
            {busy && <Loader2 className="animate-spin" />}Create account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A live hint and a clickable button, so a too-short password is explained
  // rather than leaving a greyed-out button with no reason on screen.
  const missing = 8 - password.length;
  const hint = password.length === 0
    ? "at least 8 characters"
    : missing > 0
      ? `${missing} more character${missing === 1 ? "" : "s"} needed`
      : "long enough";

  async function save() {
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.adminSetPassword(user.id, password);
    setBusy(false);
    if (result.ok) onSaved(`Password updated for ${user.email}. Their other sessions have ended.`);
    else setError(result.fields?.["password"] ?? result.message);
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New password for {user.email}</DialogTitle>
          <DialogDescription>
            They are signed out everywhere and sign in again with this password. Tell them out of
            band.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <Field label="New password" hint={hint}>
          <Input
            className={CONTROL_CLASS}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={missing > 0}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || password.length === 0}>
            {busy && <Loader2 className="animate-spin" />}Set password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------- */
/* Categories                                                                 */
/* ------------------------------------------------------------------------- */

export function CategoriesSection() {
  const { categories, reload } = useAdminCategories();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function saveCategory(
    category: AdminCategory,
    values: { name: string; tagline: string; isActive: boolean },
  ) {
    setBusyId(category.id);
    setError(null);
    const result = await api.adminUpdateCategory(category.id, values);
    setBusyId(null);
    if (!result.ok) setError(result.message);
    else reload();
  }

  async function saveLabel(id: number, name: string) {
    setBusyId(id);
    setError(null);
    const result = await api.adminUpdateSubcategory(id, name);
    setBusyId(null);
    if (!result.ok) setError(result.message);
    else reload();
  }

  return (
    <section>
      <h2 className="font-display text-2xl font-extrabold">Categories</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Names and taglines shown across the site, and the specialty labels on each homepage card.
        The URL slug never changes.
      </p>

      <Notice error={error} busy={busyId !== null} />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {categories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            busy={busyId !== null}
            onSave={(values) => void saveCategory(category, values)}
            onSaveLabel={(id, name) => void saveLabel(id, name)}
          />
        ))}
      </div>
    </section>
  );
}

function CategoryCard({
  category,
  busy,
  onSave,
  onSaveLabel,
}: {
  category: AdminCategory;
  busy: boolean;
  onSave: (values: { name: string; tagline: string; isActive: boolean }) => void;
  onSaveLabel: (id: number, name: string) => void;
}) {
  const [name, setName] = useState(category.name);
  const [tagline, setTagline] = useState(category.tagline ?? "");
  const [isActive, setIsActive] = useState(category.is_active === 1);
  const [labels, setLabels] = useState(() =>
    category.subcategories.map((row) => ({ id: row.id, name: row.name })),
  );

  useEffect(() => {
    setName(category.name);
    setTagline(category.tagline ?? "");
    setIsActive(category.is_active === 1);
    setLabels(category.subcategories.map((row) => ({ id: row.id, name: row.name })));
  }, [category]);

  const dirty =
    name !== category.name ||
    tagline !== (category.tagline ?? "") ||
    isActive !== (category.is_active === 1);

  return (
    <div className="rounded-2xl border bg-background p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-extrabold">{category.name}</h3>
          <p className="text-xs text-muted-foreground">
            /{category.slug} · {category.active_count} live of {category.listing_count}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{isActive ? "Visible" : "Hidden"}</span>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            aria-label={`Show ${category.name}`}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <Field label="Name">
          <Input
            className={CONTROL_CLASS}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Tagline">
          <Input
            className={CONTROL_CLASS}
            value={tagline}
            onChange={(event) => setTagline(event.target.value)}
          />
        </Field>
        <Button
          variant="outline"
          disabled={!dirty || busy}
          onClick={() => onSave({ name, tagline, isActive })}
        >
          Save category
        </Button>
      </div>

      {labels.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold">Specialty labels</p>
          <p className="text-xs text-muted-foreground">
            Shown on the back of this category's homepage card.
          </p>
          <div className="mt-3 grid gap-2">
            {labels.map((label, index) => (
              <div key={label.id} className="flex gap-2">
                <Input
                  className="h-10"
                  value={label.name}
                  onChange={(event) =>
                    setLabels((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, name: event.target.value } : row,
                      ),
                    )
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || label.name === category.subcategories[index]?.name}
                  onClick={() => onSaveLabel(label.id, label.name)}
                >
                  Save
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Quote requests                                                             */
/* ------------------------------------------------------------------------- */

export function QuotesSection() {
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminPage<QuoteRequestRow> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<QuoteRequestRow | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await api.adminQuotes({ q: debounced, page, pageSize: PAGE_SIZE });
    if (result.ok) setData(result.data);
    else setError(result.message);
    setBusy(false);
  }, [debounced, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const result = await api.adminDeleteQuote(deleting.id);
    setBusy(false);
    setDeleting(null);
    if (!result.ok) setError(result.message);
    else await load();
  }

  async function exportCsv() {
    const rows = await collectAll((nextPage) =>
      api.adminQuotes({ q: debounced, page: nextPage, pageSize: 100 }),
    );
    downloadCsv(
      "quote-requests.csv",
      rows.map((row) => ({
        id: row.id,
        received: row.created_at,
        name: row.name,
        email: row.email,
        phone: row.phone ?? "",
        city: row.city ?? "",
        event_date: row.event_date ?? "",
        event_type: row.event_type ?? "",
        children: row.guest_count ?? "",
        ages: row.child_age ?? "",
        budget: row.budget ?? "",
        sent_to: row.vendor_name ?? "any matching entertainer",
        details: row.details ?? "",
      })),
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-extrabold">Quote requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every request a parent sent, whoever it went to. They also appear in the dashboard
            totals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportCsv()}>
            <Download />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={busy}>
            <Loader2 className={busy ? "animate-spin" : "hidden"} />
            Refresh
          </Button>
        </div>
      </div>

      <label className="relative mt-5 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className={`${CONTROL_CLASS} pl-10`}
          placeholder="Parent, email or city"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setPage(1);
          }}
        />
      </label>

      <Notice error={error} busy={busy} />

      {data && (
        <>
          <div className="mt-5 overflow-x-auto rounded-2xl border bg-background">
            <Table className="min-w-[900px]">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-bold">Received</TableHead>
                  <TableHead className="font-bold">Parent</TableHead>
                  <TableHead className="font-bold">Party</TableHead>
                  <TableHead className="font-bold">Sent to</TableHead>
                  <TableHead className="text-right font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(quote.created_at)}
                    </TableCell>
                    <TableCell>
                      <span className="block font-semibold">{quote.name}</span>
                      <span className="block text-xs text-muted-foreground">{quote.email}</span>
                      {quote.phone && (
                        <span className="block text-xs text-muted-foreground">{quote.phone}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="block">
                        {[quote.city, quote.event_type].filter(Boolean).join(" · ") || "—"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {[
                          formatDate(quote.event_date),
                          quote.guest_count ? `${quote.guest_count} children` : "",
                          quote.budget,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </TableCell>
                    <TableCell>{quote.vendor_name ?? "Any matching entertainer"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(quote)}>
                          <Trash2 className="text-destructive" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-6 text-center text-muted-foreground">
                      No quote requests match this search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}

      <ConfirmDelete
        open={deleting !== null}
        title="Delete this quote request?"
        description={`The request from ${deleting?.email ?? ""} is removed for good, including from the sender's own list.`}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
