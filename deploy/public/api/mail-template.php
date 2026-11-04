<?php
declare(strict_types=1);

/**
 * The HTML a quote-request email is made of.
 *
 * The site is where the visitor last saw this request, so the mail wears the same
 * clothes: the logo, the purple with the purple-tinted page and rounded panels, and the
 * same words the form used ("Request a quote from …", "no account needed"). Every colour
 * below is the site's palette converted once from the oklch tokens in src/styles.css —
 * email clients support neither oklch() nor CSS variables, so they are hex literals here.
 *
 * Tables, not divs: Outlook (which many small-business inboxes run) lays out with the
 * Word engine and ignores flexbox and grid. Widths are fixed at 600px with a 100% fallback,
 * spacing is inline padding rather than margins, and the stylesheet is inlined into the
 * elements because Gmail strips <style> blocks. Nothing here loads a font or an image from
 * a third party: the only remote asset is the site's own logo.
 *
 * Both messages are built from the same frame, so they cannot drift apart.
 */

/** The palette, converted from src/styles.css so the mail and the site agree. */
const MAIL_COLOURS = [
    'page' => '#fcf6e9',        // --surface
    'card' => '#ffffff',        // --card
    'ink' => '#1c132a',         // --foreground
    'muted' => '#615d73',       // --muted-foreground
    'border' => '#ddd7e9',      // --border
    'primary' => '#7216c0',     // --primary
    'primarySoft' => '#efe0ff', // --primary-soft
    'rating' => '#f19d00',      // --rating
];

const MAIL_SITE = 'https://hirepartycharacters.com';
const MAIL_LOGO = MAIL_SITE . '/logo.png';

/** Escapes text that may contain what a visitor typed. */
function mail_escape($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** "—" for an empty answer, so a card never looks broken. */
function mail_value(array $quote, string $key, string $fallback = '—'): string
{
    $value = trim((string) ($quote[$key] ?? ''));
    return $value === '' ? $fallback : $value;
}

/**
 * A business name without a trailing full stop, for places where the sentence adds one.
 * "The Princess Party Co." already ends in a period; "… Co.." reads like a typo.
 */
function mail_name(?array $vendor, string $fallback = 'the business'): string
{
    $name = trim((string) ($vendor['name'] ?? ''));
    if ($name === '') {
        return $fallback;
    }
    return rtrim($name, ". \t\n\r");
}

/**
 * The entertainment the visitor chose arrives as a slug ("star-wars"), which is a
 * database key rather than English. This turns it back into the label the wizard showed.
 */
function mail_category(array $quote, string $fallback = '—'): string
{
    $slug = trim((string) ($quote['category_slug'] ?? ''));
    if ($slug === '') {
        return $fallback;
    }
    return ucwords(str_replace(['-', '_'], ' ', $slug));
}

/**
 * The frame both messages sit in: logo, a heading that sets the tone, the body, and a
 * quiet footer. $heading and $intro are already escaped or trusted literal HTML.
 */
function mail_frame(string $heading, string $intro, string $body, string $footNote = ''): string
{
    $c = MAIL_COLOURS;
    $logo = MAIL_SITE . '/logo.png';

    return '<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>' . mail_escape($heading) . '</title>
</head>
<body style="margin:0;padding:0;background:' . $c['page'] . ';">
<!-- The preheader is the grey line inboxes show beside the subject. Hidden in the body. -->
<div style="display:none;font-size:1px;color:' . $c['page'] . ';line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">'
        . mail_escape($intro) . '</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' . $c['page'] . ';">
  <tr>
    <td align="center" style="padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:' . $c['card'] . ';border:1px solid ' . $c['border'] . ';border-radius:12px;border-collapse:separate;overflow:hidden;">

      <tr>
        <td align="center" style="padding:26px 24px 18px 24px;">
          <a href="' . MAIL_SITE . '" style="text-decoration:none;"><img src="' . $logo . '" width="150" height="83" alt="Hire Party Characters" style="display:block;border:0;width:150px;height:auto;"></a>
        </td>
      </tr>

      <tr>
        <td style="padding:0 32px 8px 32px;text-align:center;">
          <h1 style="margin:0;font-family:\'Trebuchet MS\',Verdana,Arial,sans-serif;font-size:23px;line-height:1.3;font-weight:700;color:' . $c['ink'] . ';">' . $heading . '</h1>
          <p style="margin:10px 0 0 0;font-size:15px;line-height:1.6;color:' . $c['muted'] . ';">' . $intro . '</p>
        </td>
      </tr>

      <tr>
        <td style="padding:22px 32px 8px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td height="1" style="height:1px;line-height:1px;background:' . $c['border'] . ';">&nbsp;</td></tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding:0 32px 8px 32px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:' . $c['ink'] . ';">
          ' . $body . '
        </td>
      </tr>

      <tr>
        <td style="padding:24px 32px 28px 32px;border-top:1px solid ' . $c['border'] . ';background:' . $c['page'] . ';font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:' . $c['muted'] . ';text-align:center;">
          ' . ($footNote === '' ? '' : $footNote . '<br>') . '
          <a href="' . MAIL_SITE . '" style="color:' . $c['primary'] . ';text-decoration:none;font-weight:600;">hirepartycharacters.com</a>
          &nbsp;·&nbsp; the directory for children&rsquo;s party entertainment
        </td>
      </tr>

    </table>
    </td>
  </tr>
</table>
</body>
</html>';
}

/**
 * One question-and-answer row, as a two-column table row.
 * Long answers are allowed to wrap under their label rather than being cut.
 */
function mail_row(string $label, string $value, bool $multiline = false): string
{
    $c = MAIL_COLOURS;
    $cell = 'padding:9px 0;font-size:15px;line-height:1.55;color:' . $c['ink'] . ';vertical-align:top;';

    if ($multiline) {
        return '<tr><td colspan="2" style="' . $cell . 'border-top:1px solid ' . $c['border'] . ';">'
            . '<span style="display:block;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:' . $c['muted'] . ';padding-bottom:4px;">'
            . mail_escape($label) . '</span>'
            . nl2br(mail_escape($value)) . '</td></tr>';
    }

    return '<tr>'
        . '<td style="' . $cell . 'width:42%;padding-right:12px;color:' . $c['muted'] . ';">' . mail_escape($label) . '</td>'
        . '<td style="' . $cell . 'font-weight:600;">' . mail_escape($value) . '</td>'
        . '</tr>';
}

/** The white panel the answers sit in. */
function mail_panel(string $inner, string $title = ''): string
{
    $c = MAIL_COLOURS;
    $head = $title === ''
        ? ''
        : '<p style="margin:0 0 4px 0;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:' . $c['muted'] . ';">'
            . mail_escape($title) . '</p>';

    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;background:' . $c['page'] . ';border:1px solid ' . $c['border'] . ';border-radius:10px;">'
        . '<tr><td style="padding:16px 18px;">' . $head
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' . $inner . '</table>'
        . '</td></tr></table>';
}

/** A rounded purple button that keeps its shape in Outlook. */
function mail_button(string $href, string $label): string
{
    $c = MAIL_COLOURS;
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px 0;">'
        . '<tr><td align="center" bgcolor="' . $c['primary'] . '" style="border-radius:8px;">'
        . '<a href="' . mail_escape($href) . '" style="display:inline-block;padding:13px 24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">'
        . mail_escape($label) . '</a>'
        . '</td></tr></table>';
}

/** A pill with the listing's name, so the business is unmistakable at a glance. */
function mail_listing_pill(?array $vendor): string
{
    $c = MAIL_COLOURS;
    if ($vendor === null) {
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;">'
            . '<tr><td style="padding:12px 16px;background:' . $c['primarySoft'] . ';border-radius:10px;font-size:15px;line-height:1.5;color:' . $c['ink'] . ';">'
            . 'This request came to the directory rather than to one business.</td></tr></table>';
    }

    $name = (string) ($vendor['name'] ?? '');
    $where = trim(implode(', ', array_filter([(string) ($vendor['city_name'] ?? ''), (string) ($vendor['state_code'] ?? '')])));
    $category = (string) ($vendor['category_name'] ?? '');
    $detail = trim(implode(' · ', array_filter([$category, $where])));

    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;">'
        . '<tr><td style="padding:14px 16px;background:' . $c['primarySoft'] . ';border-radius:10px;">'
        . '<p style="margin:0;font-size:17px;font-weight:700;line-height:1.35;color:' . $c['ink'] . ';">' . mail_escape($name) . '</p>'
        . ($detail === '' ? '' : '<p style="margin:3px 0 0 0;font-size:14px;line-height:1.45;color:' . $c['muted'] . ';">' . mail_escape($detail) . '</p>')
        . '</td></tr></table>';
}

/** The plain-text alternative. Somebody reading on a watch or through a screen reader
 *  gets the same answers, in the same order, with no layout to parse. */
function mail_plain(string $heading, array $lines): string
{
    return $heading . "\n\n" . implode("\n", $lines) . "\n\n— hirepartycharacters.com\n";
}
