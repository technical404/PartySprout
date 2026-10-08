/**
 * One size for every data-entry control, so a form reads the same on a phone
 * whatever it happens to be asking: 48px tall, 16px text (which also stops iOS
 * zooming the page when a field takes focus), rounded, and a red ring once the
 * field is marked invalid.
 *
 * This is deliberately not the `Input` / `Textarea` / `Select` default. The two
 * search panels size their own fields to the shell they sit in (see
 * `.search-field` in styles.css), and the compact bar's sticky offset is measured
 * from that height, so the defaults stay as they are.
 */
const CONTROL_SHAPE = "rounded-xl px-4 text-base aria-invalid:border-destructive aria-invalid:ring-destructive/30";

export const CONTROL_CLASS = `h-12 ${CONTROL_SHAPE}`;

/** Long text controls keep the shape but grow with their rows. */
export const CONTROL_AREA_CLASS = `min-h-32 py-3 ${CONTROL_SHAPE}`;
