import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  Building2,
  CalendarCheck,
  Check,
  Loader2,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Footer } from "./footer";
import {
  fetchCategories,
  fetchCitySuggestions,
  fetchVendor,
  submitQuoteRequest,
  type Category,
  type City,
  type Vendor,
} from "@/lib/marketplace-data";
import { SUPPORT_EMAIL } from "@/lib/site";
import { PHONE_ERROR, countError, isValidPhone, normalisePhone, sanitisePhoneInput } from "@/lib/validation";

const BUDGETS = [
  "Under $200",
  "$200 – $400",
  "$400 – $700",
  "$700 – $1,000",
  "$1,000+",
  "Not sure yet",
];

/**
 * The event list the reference dropdown uses: a short "Popular" run, then every
 * event type alphabetically. The two groups overlap on purpose, which is also
 * why this one control is a native <select> — a Radix SelectItem value has to be
 * unique inside its list, and the same party has to store the same string
 * whichever group it was picked from.
 */
const POPULAR_EVENT_TYPES = [
  "Birthday (Adult)",
  "Birthday (Child)",
  "Birthday (Teen)",
  "Cocktail Party",
  "Corporate Event",
  "Dinner Party",
  "Festival",
  "Fundraiser",
  "Holiday Party (Christmas)",
  "House Party",
  "Nonprofit Event",
  "Personal Occasion",
  "Surprise",
  "Wedding Ceremony",
  "Wedding Reception",
];

const ALL_EVENT_TYPES = [
  "Anniversary Party",
  "Baby Shower",
  "Bachelor Party",
  "Bachelorette Party",
  "Bar Mitzvah",
  "Bat Mitzvah",
  "Birthday (Adult)",
  "Birthday (Child)",
  "Birthday (Teen)",
  "Christening",
  "Cocktail Party",
  "Community Event",
  "Corporate Event",
  "Dinner Party",
  "Engagement Party",
  "Festival",
  "Fundraiser",
  "Graduation Party",
  "Holiday Party (Christmas)",
  "House Party",
  "Nonprofit Event",
  "Personal Occasion",
  "Prom",
  "Retirement Party",
  "School Event",
  "Surprise",
  "Wedding Ceremony",
  "Wedding Reception",
];

const quoteSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name."),
  email: z.string().trim().min(1, "Please enter your email.").email("Enter a valid email address."),
  // Optional, but it has to look like a phone number: type="tel" only hints to
  // the mobile keyboard and never rejected a letter.
  phone: z.string().trim().refine(isValidPhone, { message: PHONE_ERROR }),
  eventDate: z.string(),
  city: z.string().trim().min(2, "Which city is the party in?"),
  guestCount: z.string().trim().refine((value) => countError(value) === null, { message: "Use a whole number of children." }),
  childAge: z.string().trim(),
  eventType: z.string().min(1, "Pick the type of event you are planning."),
  category: z.string().min(1, "Pick the entertainment you are after."),
  budget: z.string().min(1, "Please pick an approximate budget."),
  details: z.string().trim().min(10, "Tell us a bit more — at least 10 characters."),
});

type QuoteFormValues = z.infer<typeof quoteSchema>;

const EMPTY_FORM: QuoteFormValues = {
  name: "",
  email: "",
  phone: "",
  eventDate: "",
  city: "",
  guestCount: "",
  childAge: "",
  eventType: "",
  category: "",
  budget: "",
  details: "",
};

/**
 * The request is asked one question at a time rather than as one long form.
 * Each step owns a single field, shows how far along the visitor is, and has to
 * be answered before the next one opens — so nobody reaches the end with a
 * missing answer behind them. Optional questions simply let "Next" through.
 */
type QuoteStep = {
  field: keyof QuoteFormValues;
  question: string;
  hint?: string;
};

const FIRST_STEP: QuoteStep = {
  field: "eventType",
  question: "What type of event are you planning?",
  hint: "Pick the closest match — you can add the detail later.",
};

const STEPS: QuoteStep[] = [
  FIRST_STEP,
  {
    field: "category",
    question: "What kind of entertainment are you looking for?",
    hint: "Pick the entertainment you have in mind.",
  },
  {
    field: "city",
    question: "Where is the party?",
    hint: "We only match entertainers who cover your area.",
  },
  {
    field: "eventDate",
    question: "When is the party?",
    hint: "Skip this if you have not settled on a date yet.",
  },
  {
    field: "guestCount",
    question: "How many children are you expecting?",
    hint: "An approximate number is fine.",
  },
  {
    field: "childAge",
    question: "How old are the children?",
    hint: "Ages help entertainers pitch the right show.",
  },
  {
    field: "budget",
    question: "What is your budget?",
    hint: "A rough range keeps the quotes realistic.",
  },
  {
    field: "details",
    question: "Anything else the entertainer should know?",
    hint: "Theme, venue, timings, special requests.",
  },
  { field: "name", question: "What is your name?" },
  {
    field: "email",
    question: "What is your email?",
    hint: "Quotes and replies come back to this address.",
  },
  {
    field: "phone",
    question: "What is your phone number?",
    hint: "Optional, but it is the quickest way to reach you.",
  },
];

/** Today in the visitor's own timezone, for the date field's earliest choice. */
function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Circular progress with the percentage sitting in the middle of the ring. */
function ProgressRing({ value }: { value: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative size-16" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-primary transition-[stroke-dashoffset] duration-500 ease-out"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-bold text-muted-foreground">
        {Math.round(value)}%
      </span>
    </div>
  );
}

/** The question and its hint, which double as the field's label and description. */
function StepQuestion({ question, hint }: { question: string; hint?: string | undefined }) {
  return (
    <>
      <FormLabel className="block font-display text-xl leading-snug font-extrabold sm:text-2xl">
        {question}
      </FormLabel>
      {hint && <FormDescription className="text-sm leading-6">{hint}</FormDescription>}
    </>
  );
}

/** Shared look for every control, so a step reads the same whatever it asks. */
const CONTROL_CLASS = "h-12 rounded-xl px-4 text-base";
const CONTROL_INVALID = "aria-invalid:border-destructive aria-invalid:ring-destructive/30";

export function RequestQuoteForm({
  vendor = null,
  defaultCategorySlug = "",
  prefill,
  embedded = false,
}: {
  vendor?: Vendor | null;
  defaultCategorySlug?: string;
  /** Values carried in from search (city, date, children, category). */
  prefill?: Partial<QuoteFormValues>;
  /** Drops the card chrome when the form is rendered inside a dialog. */
  embedded?: boolean;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<City[]>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    void fetchCategories().then(setCategories);
  }, []);

  const defaults = useMemo<QuoteFormValues>(
    () => ({ ...EMPTY_FORM, ...prefill, category: prefill?.category ?? defaultCategorySlug }),
    [defaultCategorySlug, prefill],
  );

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteSchema),
    defaultValues: defaults,
  });

  // City type-ahead, debounced exactly like the search panel's Where field.
  const cityTerm = form.watch("city");
  useEffect(() => {
    const term = cityTerm.trim();
    if (term.length < 2) {
      setCitySuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchCitySuggestions(term).then((rows) => {
        if (!cancelled) setCitySuggestions(rows);
      });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cityTerm]);

  const current = STEPS[step] ?? FIRST_STEP;
  const isLastStep = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  /** Only open the next question once this one has nothing left to answer. */
  async function goNext() {
    const valid = await form.trigger(current.field);
    if (valid) setStep((index) => Math.min(index + 1, STEPS.length - 1));
  }

  /**
   * When the whole form is submitted from the last step, a rejection from an
   * earlier question would be invisible — so land the visitor back on it.
   */
  function goToFirstProblem(problems: Array<keyof QuoteFormValues>) {
    const index = STEPS.findIndex((item) => problems.includes(item.field));
    if (index >= 0) setStep(index);
  }

  async function onSubmit(values: QuoteFormValues) {
    setStatus("sending");
    setServerError(null);

    const result = await submitQuoteRequest({
      name: values.name,
      email: values.email,
      phone: normalisePhone(values.phone),
      city: values.city,
      eventDate: values.eventDate,
      guestCount: values.guestCount,
      childAge: values.childAge,
      eventType: values.eventType,
      categorySlug: values.category,
      budget: values.budget,
      details: values.details,
      ...(vendor ? { vendorSlug: vendor.slug } : {}),
    });

    if (!result.ok) {
      // Surface any field-level errors the server rejected, and go back to the
      // question that holds them so the messages are actually visible.
      const rejected: Array<keyof QuoteFormValues> = [];
      for (const [field, message] of Object.entries(result.fields ?? {})) {
        if (field in EMPTY_FORM) {
          form.setError(field as keyof QuoteFormValues, { message });
          rejected.push(field as keyof QuoteFormValues);
        }
      }
      setServerError(result.message);
      setStatus("idle");
      goToFirstProblem(rejected);
      return;
    }

    setStatus("sent");
    form.reset(defaults);
  }

  if (status === "sent") {
    return (
      <div className="rounded-2xl border bg-background p-8 text-center shadow-sm sm:p-12">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-success-soft text-success">
          <Check className="size-8" />
        </span>
        <h2 className="mt-5 font-display text-2xl font-extrabold">Your request is in.</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">
          {vendor
            ? `We passed your details to ${vendor.name} and other matching entertainers nearby.`
            : "We passed your details to matching entertainers near you."}{" "}
          Expect replies by email{form.getValues("phone") ? " or phone" : ""} within a day or two.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button variant="outline" onClick={() => { setStatus("idle"); setStep(0); }}>
            Send another request
          </Button>
          {!embedded && <Button asChild>
            <Link to="/search" search={{ q: "", location: "" }}>
              Keep browsing
            </Link>
          </Button>}
        </div>
      </div>
    );
  }

  const question = (hint: string | undefined, control: React.ReactNode) => (
    <FormItem className="mt-6">
      <StepQuestion question={current.question} hint={hint} />
      <FormControl>{control}</FormControl>
      <FormMessage />
    </FormItem>
  );

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, (errors) =>
          goToFirstProblem(Object.keys(errors) as Array<keyof QuoteFormValues>),
        )}
        className={embedded ? "" : "rounded-2xl border bg-background p-6 shadow-sm sm:p-9"}
        noValidate
      >
        {vendor && (
          <div className="mb-7 flex items-center gap-3 rounded-lg border border-primary/25 bg-primary-soft p-4">
            <Building2 className="size-5 shrink-0 text-primary" />
            <p className="text-sm font-semibold">
              Requesting a quote from <b>{vendor.name}</b>
              {vendor.location ? ` · ${vendor.location}` : ""}
            </p>
          </div>
        )}

        {serverError && (
          <div
            role="alert"
            className="mb-7 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-5 shrink-0" />
            <p>
              {serverError} You can also email us at{" "}
              <a className="font-semibold underline" href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </div>
        )}

        <div key={step} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <ProgressRing value={progress} />

          {current.field === "eventType" && (
            <FormField
              control={form.control}
              name="eventType"
              render={({ field }) => question(current.hint, (
                <select
                  {...field}
                  className={`${CONTROL_CLASS} ${CONTROL_INVALID} border border-input bg-transparent shadow-sm focus:outline-none focus:ring-1 focus:ring-ring`}
                >
                  <option value="" disabled>
                    Choose one
                  </option>
                  <optgroup label="Popular">
                    {POPULAR_EVENT_TYPES.map((event) => (
                      <option key={event} value={event}>
                        {event}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="All events">
                    {ALL_EVENT_TYPES.map((event) => (
                      <option key={event} value={event}>
                        {event}
                      </option>
                    ))}
                  </optgroup>
                </select>
              ))}
            />
          )}

          {current.field === "category" && (
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => question(current.hint, (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className={`${CONTROL_CLASS} ${CONTROL_INVALID}`}>
                    <SelectValue placeholder="Choose one" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.slug} value={category.slug}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
            />
          )}

          {current.field === "city" && (
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                // The suggestion list stands outside FormControl so the input itself
                // keeps the id and aria-invalid the form wires up for it.
                <div className="relative">
                  <FormItem className="mt-6">
                    <StepQuestion question={current.question} hint={current.hint} />
                    <FormControl>
                      <Input
                        autoComplete="off"
                        placeholder="Dallas, TX"
                        className={`${CONTROL_CLASS} ${CONTROL_INVALID}`}
                        {...field}
                        onChange={(event) => {
                          field.onChange(event);
                          setCityOpen(true);
                        }}
                        onFocus={() => setCityOpen(true)}
                        onBlur={() => window.setTimeout(() => setCityOpen(false), 120)}
                      />
                    </FormControl>
                    <FormMessage />
                    {cityOpen && citySuggestions.length > 0 && (
                      <ul className="search-suggest" role="listbox">
                        {citySuggestions.map((city) => (
                          <li key={`${city.name}-${city.stateCode}`}>
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                field.onChange(city.label);
                                setCityOpen(false);
                              }}
                            >
                              <span>{city.label}</span>
                              <span>{city.count} businesses</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </FormItem>
                </div>
              )}
            />
          )}

          {current.field === "eventDate" && (
            <FormField
              control={form.control}
              name="eventDate"
              render={({ field }) => question(current.hint, (
                <Input
                  type="date"
                  min={todayISO()}
                  className={`date-field ${CONTROL_CLASS} ${CONTROL_INVALID}`}
                  {...field}
                  onClick={(event) => {
                    // Chromium opens the picker from the stretched calendar glyph (see
                    // .date-field in styles.css); Firefox and Safari have to be asked,
                    // and whichever engine already opened it throws here instead.
                    try {
                      event.currentTarget.showPicker();
                    } catch {
                      /* the picker is already open */
                    }
                  }}
                />
              ))}
            />
          )}

          {current.field === "guestCount" && (
            <FormField
              control={form.control}
              name="guestCount"
              render={({ field }) => question(current.hint, (
                <Input inputMode="numeric" placeholder="15" className={`${CONTROL_CLASS} ${CONTROL_INVALID}`} {...field} />
              ))}
            />
          )}

          {current.field === "childAge" && (
            <FormField
              control={form.control}
              name="childAge"
              render={({ field }) => question(current.hint, (
                <Input placeholder="Mostly age 6" className={`${CONTROL_CLASS} ${CONTROL_INVALID}`} {...field} />
              ))}
            />
          )}

          {current.field === "budget" && (
            <FormField
              control={form.control}
              name="budget"
              render={({ field }) => question(current.hint, (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className={`${CONTROL_CLASS} ${CONTROL_INVALID}`}>
                    <SelectValue placeholder="Choose a range" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUDGETS.map((budget) => (
                      <SelectItem key={budget} value={budget}>
                        {budget}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
            />
          )}

          {current.field === "details" && (
            <FormField
              control={form.control}
              name="details"
              render={({ field }) => question(current.hint, (
                <Textarea
                  rows={5}
                  placeholder="Superhero theme, back garden, 2pm start…"
                  className={`min-h-32 rounded-xl px-4 py-3 text-base ${CONTROL_INVALID}`}
                  {...field}
                />
              ))}
            />
          )}

          {current.field === "name" && (
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => question(current.hint, (
                <Input autoComplete="name" placeholder="Alex Rivera" className={`${CONTROL_CLASS} ${CONTROL_INVALID}`} {...field} />
              ))}
            />
          )}

          {current.field === "email" && (
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => question(current.hint, (
                <Input type="email" autoComplete="email" placeholder="alex@example.com" className={`${CONTROL_CLASS} ${CONTROL_INVALID}`} {...field} />
              ))}
            />
          )}

          {current.field === "phone" && (
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => question(current.hint, (
                <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 555 010 2030" className={`${CONTROL_CLASS} ${CONTROL_INVALID}`} {...field} onChange={(event) => field.onChange(sanitisePhoneInput(event.target.value))} />
              ))}
            />
          )}
        </div>

        <div className="mt-7 flex items-center gap-3">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 flex-1 rounded-xl"
              onClick={() => setStep((index) => Math.max(index - 1, 0))}
            >
              Back
            </Button>
          )}
          {isLastStep ? (
            <Button
              key="send"
              type="submit"
              size="lg"
              className="h-12 flex-1 rounded-xl"
              disabled={status === "sending"}
            >
              {status === "sending" ? (
                <>
                  <Loader2 className="animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send />
                  Send quote request
                </>
              )}
            </Button>
          ) : (
            <Button
              key="next"
              type="button"
              size="lg"
              className="h-12 flex-1 rounded-xl"
              onClick={() => void goNext()}
            >
              Next
            </Button>
          )}
        </div>

        <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-trust" />
          We only share your details with entertainers who can serve your date. Question {step + 1} of{" "}
          {STEPS.length}.
        </p>
      </form>
    </Form>
  );
}

export function RequestQuotePage({ vendorSlug = "", prefill }: {
  vendorSlug?: string;
  prefill?: {
    city?: string | undefined;
    date?: string | undefined;
    kids?: string | undefined;
    category?: string | undefined;
  };
}) {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(Boolean(vendorSlug));

  useEffect(() => {
    if (!vendorSlug) {
      setVendor(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchVendor(vendorSlug).then((result) => {
      if (cancelled) return;
      setVendor(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [vendorSlug]);

  // Skip empty strings so a blank query parameter does not blank out a field
  // the form could otherwise leave as its own default.
  const defaults = useMemo<Partial<QuoteFormValues>>(() => {
    const values: Partial<QuoteFormValues> = {};
    if (prefill?.city) values.city = prefill.city;
    if (prefill?.date) values.eventDate = prefill.date;
    if (prefill?.kids) values.guestCount = prefill.kids;
    if (prefill?.category) values.category = prefill.category;
    return values;
  }, [prefill?.city, prefill?.date, prefill?.kids, prefill?.category]);

  return (
    <main className="min-h-screen bg-surface pb-24">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="max-w-3xl">
          <p className="font-bold text-primary">Request a quote</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
            One form. Matching entertainers.
          </h1>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            Tell us what you have in mind and we will pass it to children&rsquo;s entertainers who
            cover your city and date. No account needed, no obligation to book.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            {loading ? (
              <p className="rounded-2xl border bg-background p-10 text-muted-foreground">
                Loading business…
              </p>
            ) : (
              <RequestQuoteForm vendor={vendor} prefill={defaults} />
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border bg-background p-6">
              <h2 className="font-display text-lg font-extrabold">What happens next</h2>
              <ol className="mt-5 space-y-5">
                {[
                  {
                    Icon: Send,
                    title: "You send the details",
                    copy: "One form covers theme, date, city and budget.",
                  },
                  {
                    Icon: Building2,
                    title: "Entertainers reply",
                    copy: "You hear back by email or phone, usually within a day or two.",
                  },
                  {
                    Icon: CalendarCheck,
                    title: "You book what fits",
                    copy: "Compare replies and book only when it feels right.",
                  },
                ].map(({ Icon, title, copy }) => (
                  <li key={title} className="flex gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span>
                      <b className="block text-sm">{title}</b>
                      <span className="mt-1 block text-sm text-muted-foreground">{copy}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-2xl border bg-background p-6 text-sm text-muted-foreground">
              <p className="font-display text-base font-extrabold text-foreground">
                Prefer to email?
              </p>
              <p className="mt-2 leading-7">
                Write to{" "}
                <a
                  className="font-semibold text-primary underline"
                  href={`mailto:${SUPPORT_EMAIL}`}
                >
                  {SUPPORT_EMAIL}
                </a>{" "}
                and we will route it for you.
              </p>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </main>
  );
}

/**
 * The vendor-facing "Request quote" dialog used by every result card and the
 * vendor profile. It renders the same form as /request-quote, so the request
 * becomes a real row in quote_requests instead of a fake success screen.
 */
export function QuoteDialog({ vendor, open = false, onOpenChange = () => {} }: {
  vendor: Vendor;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Request a quote from {vendor.name}
          </DialogTitle>
          <DialogDescription>
            This goes straight to {vendor.name}
            {vendor.location ? ` in ${vendor.location}` : ""} — no account needed, and you are not
            obliged to book.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <RequestQuoteForm vendor={vendor} embedded />
        </div>
      </DialogContent>
    </Dialog>
  );
}
