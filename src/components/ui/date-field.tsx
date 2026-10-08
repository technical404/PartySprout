import * as React from "react";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { dateFromISO, formatDate, isoFromDate, maskDate, parseDate } from "@/lib/dates";

type DateFieldProps = {
  /** ISO yyyy-mm-dd, or "" for "no date chosen". */
  value: string;
  onChange: (iso: string) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  /** ISO yyyy-mm-dd. Earlier days are neither accepted nor offered. */
  min?: string;
  id?: string;
  name?: string;
  className?: string;
  wrapperClassName?: string;
  "aria-label"?: string;
};

/**
 * A date box that reads and writes mm-dd-yyyy anywhere in the world, because a
 * native date input follows the browser's locale instead (see lib/dates.ts). Typing
 * is the fast path — the digits are shaped into mm-dd-yyyy as they go, so a phone's
 * number pad is enough — and the calendar beside it is there for whoever prefers
 * picking. Only text that is a real, allowed date is committed.
 *
 * The calendar renders in a portal, so its buttons are never inside the form that
 * holds this field and cannot submit it.
 */
export const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(function DateField(
  { value, onChange, onBlur, min, id, name, className, wrapperClassName, ...rest },
  ref,
) {
  // What is typed wins until it is either a date or abandoned; otherwise the box
  // shows the value it is actually holding.
  const [draft, setDraft] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const earliest = min ? dateFromISO(min) : undefined;
  const starting = dateFromISO(value) ?? earliest;
  const tooEarly = (iso: string) => Boolean(min && iso < min);

  function type(raw: string) {
    const next = maskDate(raw);
    setDraft(next);
    const iso = parseDate(next);
    if (iso && !tooEarly(iso)) onChange(iso);
    else if (next === "") onChange("");
  }

  return <div className={cn("relative", wrapperClassName)}>
    <Input
      ref={ref}
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="mm-dd-yyyy"
      value={draft ?? formatDate(value)}
      onChange={(event) => type(event.target.value)}
      // Leaving the box drops text that never became a date, so it cannot sit there
      // looking like an answer that was accepted when it was not.
      onBlur={(event) => { setDraft(null); onBlur?.(event); }}
      className={cn(className, "pr-11")}
      {...rest}
    />
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Pick a date from the calendar"
          className="absolute right-1 top-1/2 size-8 -translate-y-1/2 rounded-full text-primary"
        >
          <CalendarDays />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar
          mode="single"
          autoFocus
          selected={dateFromISO(value)}
          {...(starting ? { defaultMonth: starting } : {})}
          {...(earliest ? { startMonth: earliest, disabled: { before: earliest } } : {})}
          onSelect={(day) => {
            setDraft(null);
            onChange(day ? isoFromDate(day) : "");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  </div>;
});
