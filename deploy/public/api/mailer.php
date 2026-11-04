<?php
declare(strict_types=1);

/**
 * Outgoing mail for the PHP deployment.
 *
 * There is no Composer and no PHPMailer on the host, so this speaks SMTP itself over
 * implicit TLS (port 465): greet, EHLO, AUTH LOGIN, MAIL FROM, RCPT TO, DATA, QUIT.
 *
 * Settings come from mail-config.php next to db-config.php — outside the web root, so
 * the mailbox password is never served and never committed. With no config file the
 * deployment simply does not send mail, which is what local development wants.
 *
 * Nothing here may break a request: notify_quote_request() returns a result array and
 * logs, and the caller answers the visitor regardless of what the mail server did.
 */

require_once __DIR__ . '/mail-template.php';

/** The SMTP settings, or null when this deployment was never given a mailbox. */
function mail_settings(): ?array
{
    static $settings = false;
    if ($settings !== false) {
        return $settings;
    }
    foreach ([dirname(__DIR__, 2) . '/mail-config.php', __DIR__ . '/mail-config.php'] as $path) {
        if (!is_file($path)) {
            continue;
        }
        $loaded = require $path;
        if (is_array($loaded) && ($loaded['host'] ?? '') !== '' && ($loaded['username'] ?? '') !== '') {
            $settings = $loaded;
            return $settings;
        }
    }
    $settings = null;
    return $settings;
}

/** Reads one complete SMTP reply, joining "250-" continuation lines. */
function smtp_read($socket): string
{
    $text = '';
    while (($line = fgets($socket, 2048)) !== false) {
        $line = rtrim($line, "\r\n");
        if (strlen($line) < 4) {
            throw new RuntimeException('malformed reply: ' . $line);
        }
        $code = substr($line, 0, 3);
        $text .= ($text === '' ? '' : ' ') . substr($line, 4);
        if ($line[3] === ' ') {
            return $code . ' ' . $text;
        }
    }
    $meta = stream_get_meta_data($socket);
    throw new RuntimeException($meta['timed_out'] ? 'timed out waiting for a reply' : 'connection closed');
}

/** Sends one command and insists on one of $codes. */
function smtp_expect($socket, string $command, array $codes, string $label): string
{
    if ($command !== '') {
        if (@fwrite($socket, $command . "\r\n") === false) {
            throw new RuntimeException("could not send $label");
        }
    }
    $reply = smtp_read($socket);
    if (!in_array((int) substr($reply, 0, 3), $codes, true)) {
        throw new RuntimeException("$label refused: $reply");
    }
    return $reply;
}

/**
 * Sends one message, plain text with an HTML alternative when one is given.
 *
 * $mail: to (list), subject, text, html (optional), replyTo (optional).
 * Returns ['ok' => true, 'id' => SMTP queue id] or ['ok' => false, 'error' => message].
 */
function smtp_send_text(array $settings, array $mail): array
{
    $host = (string) $settings['host'];
    $port = (int) ($settings['port'] ?? 465);
    $from = (string) ($settings['from_email'] ?? $settings['username']);
    $fromName = (string) ($settings['from_name'] ?? '');
    $timeout = (float) ($settings['timeout'] ?? 8.0);
    $domain = substr(strrchr($from, '@') ?: '@localhost', 1);

    $recipients = [];
    foreach ((array) ($mail['to'] ?? []) as $address) {
        $address = trim((string) $address);
        if ($address !== '') {
            $recipients[] = $address;
        }
    }
    if ($recipients === []) {
        return ['ok' => false, 'error' => 'no recipient'];
    }

    $socket = null;
    try {
        $context = stream_context_create([
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true],
        ]);
        $socket = @stream_socket_client(
            "ssl://$host:$port",
            $errno,
            $errstr,
            $timeout,
            STREAM_CLIENT_CONNECT,
            $context,
        );
        if ($socket === false) {
            throw new RuntimeException("could not connect to $host:$port ($errstr)");
        }
        stream_set_timeout($socket, (int) $timeout);

        smtp_expect($socket, '', [220], 'greeting');

        $ehloName = $settings['ehlo_name'] ?? ('www.' . $domain);
        smtp_expect($socket, 'EHLO ' . $ehloName, [250], 'EHLO');

        smtp_expect($socket, 'AUTH LOGIN', [334], 'AUTH LOGIN');
        smtp_expect($socket, base64_encode((string) $settings['username']), [334], 'username');
        smtp_expect($socket, base64_encode((string) $settings['password']), [235], 'password');

        smtp_expect($socket, "MAIL FROM:<$from>", [250], 'MAIL FROM');
        foreach ($recipients as $address) {
            smtp_expect($socket, "RCPT TO:<$address>", [250, 251], "RCPT TO <$address>");
        }
        smtp_expect($socket, 'DATA', [354], 'DATA');

        $subject = (string) ($mail['subject'] ?? '');
        $subject = preg_match('/[^\x20-\x7E]/', $subject) === 1
            ? '=?UTF-8?B?' . base64_encode($subject) . '?='
            : $subject;

        $headers = [
            'Date: ' . date('r'),
            'From: ' . ($fromName === '' ? $from : sprintf('%s <%s>', mail_header_name($fromName), $from)),
            'To: ' . implode(', ', $recipients),
            'Subject: ' . $subject,
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $domain . '>',
            'MIME-Version: 1.0',
            // Marks the mail as its own: a stray auto-reply cannot start a loop.
            'Auto-Submitted: auto-generated',
        ];
        $replyTo = trim((string) ($mail['replyTo'] ?? ''));
        if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL) !== false) {
            $headers[] = 'Reply-To: ' . $replyTo;
        }

        $plain = rtrim(str_replace(["\r\n", "\r"], "\n", (string) ($mail['text'] ?? '')), "\n");
        $html = (string) ($mail['html'] ?? '');

        if ($html === '') {
            $headers[] = 'Content-Type: text/plain; charset=utf-8';
            $headers[] = 'Content-Transfer-Encoding: base64';
            $encoded = chunk_split(base64_encode($plain), 76, "\r\n");
        } else {
            // multipart/alternative: the last part is the one a client prefers, so the
            // HTML goes second and the plain text stays the fallback that always works.
            $boundary = 'ps-' . bin2hex(random_bytes(12));
            $headers[] = 'Content-Type: multipart/alternative; boundary="' . $boundary . '"';
            $encoded = implode("\r\n", [
                '--' . $boundary,
                'Content-Type: text/plain; charset=utf-8',
                'Content-Transfer-Encoding: base64',
                '',
                chunk_split(base64_encode($plain), 76, "\r\n"),
                '--' . $boundary,
                'Content-Type: text/html; charset=utf-8',
                'Content-Transfer-Encoding: base64',
                '',
                chunk_split(base64_encode(str_replace(["\r\n", "\r"], "\n", $html)), 76, "\r\n"),
                '--' . $boundary . '--',
            ]);
        }

        $message = implode("\r\n", $headers) . "\r\n\r\n" . $encoded;

        if (@fwrite($socket, $message . "\r\n.\r\n") === false) {
            throw new RuntimeException('could not send the message body');
        }
        $accepted = smtp_expect($socket, '', [250], 'message body');
        preg_match('/id=(\S+)/', $accepted, $match);

        @fwrite($socket, "QUIT\r\n");
        @fclose($socket);

        return ['ok' => true, 'id' => $match[1] ?? null, 'to' => $recipients];
    } catch (Throwable $error) {
        if (is_resource($socket)) {
            @fclose($socket);
        }
        return ['ok' => false, 'error' => $error->getMessage()];
    }
}

/** A display name with commas or angle brackets would break the header line. */
function mail_header_name(string $name): string
{
    return preg_match('/[^\x20-\x7E]/', $name) === 1
        ? '=?UTF-8?B?' . base64_encode($name) . '?='
        : '"' . str_replace(['"', '\\'], '', $name) . '"';
}

/**
 * Who hears about a quote request: the listing's own address when it has one, the operator's
 * configured inbox, and every signed-in admin account. Duplicates are dropped, so an admin
 * whose address is also notify_email gets one message, not two.
 */
function quote_request_recipients(array $settings, ?array $vendor, array $also = []): array
{
    $candidates = [trim((string) ($vendor['email'] ?? ''))];
    $candidates[] = trim((string) ($settings['notify_email'] ?? ''));
    foreach ($also as $address) {
        $candidates[] = trim((string) $address);
    }

    $recipients = [];
    foreach ($candidates as $address) {
        if ($address === '' || filter_var($address, FILTER_VALIDATE_EMAIL) === false) {
            continue;
        }
        if (!in_array(strtolower($address), array_map('strtolower', $recipients), true)) {
            $recipients[] = $address;
        }
    }
    return $recipients;
}

/** The message body: everything the wizard asked, in the order it asked. */
function quote_request_text(array $quote, ?array $vendor): string
{
    $value = static fn (string $key, string $fallback = '—'): string => trim((string) ($quote[$key] ?? '')) ?: $fallback;

    $lines = [];
    $lines[] = 'A new quote request came through the directory.';
    $lines[] = '';
    if ($vendor !== null) {
        $slug = trim((string) ($vendor['slug'] ?? ''));
        $lines[] = 'Listing:  ' . ($vendor['name'] ?? '') . ($slug === '' ? '' : ' (' . $slug . ')');
    } else {
        $lines[] = 'Listing:  no particular business — the visitor asked the directory.';
    }
    $lines[] = '';
    $lines[] = 'Name:     ' . $value('name');
    $lines[] = 'Email:    ' . $value('email');
    $lines[] = 'Phone:    ' . $value('phone');
    $lines[] = 'City:     ' . $value('city');
    $lines[] = 'Date:     ' . $value('event_date');
    $lines[] = 'Children: ' . $value('guest_count');
    $lines[] = 'Ages:     ' . $value('child_age');
    $lines[] = 'Event:    ' . $value('event_type');
    $lines[] = 'Looking for: ' . mail_category($quote);
    $lines[] = 'Budget:   ' . $value('budget');
    $lines[] = '';
    $lines[] = 'What they said:';
    $lines[] = (string) $value('details', '(nothing)');
    $lines[] = '';
    $lines[] = '— sent by hirepartycharacters.com';
    $lines[] = 'Reply to this message to answer the visitor directly.';

    return implode("\n", $lines);
}

/**
 * The message the listing, the operator and the admins read: who wants what, where and
 * when, and a way to answer the visitor without leaving the inbox.
 */
function quote_request_html(array $quote, ?array $vendor): string
{
    $name = mail_value($quote, 'name', 'A visitor');
    $where = mail_value($quote, 'city');

    $answered = mail_row('Name', $name)
        . mail_row('Email', mail_value($quote, 'email'))
        . mail_row('Phone', mail_value($quote, 'phone'));

    $party = mail_row('Date', mail_value($quote, 'event_date'))
        . mail_row('City', $where)
        . mail_row('Children', mail_value($quote, 'guest_count'))
        . mail_row('Ages', mail_value($quote, 'child_age'))
        . mail_row('Event type', mail_value($quote, 'event_type'))
        . mail_row('Entertainment', mail_category($quote))
        . mail_row('Budget', mail_value($quote, 'budget'));

    $notes = mail_panel(mail_row('What they are planning', mail_value($quote, 'details', '(left blank)'), true));

    $body = mail_listing_pill($vendor)
        . mail_panel($answered, 'Who is asking')
        . mail_panel($party, 'The party')
        . $notes
        . mail_button('mailto:' . rawurlencode(mail_value($quote, 'email', '')), 'Reply to ' . $name)
        . '<p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:' . MAIL_COLOURS['muted'] . ';">'
        . 'Replying to this email answers ' . mail_escape($name) . ' directly — no account needed. '
        . 'Nothing has been charged or booked: they are waiting for a quote.</p>';

    $heading = $vendor === null ? 'A new quote request' : 'A new quote request for ' . mail_escape((string) ($vendor['name'] ?? ''));
    $intro = $vendor === null
        ? 'A parent used the directory to ask for a quote. Their answers are below.'
        : 'A parent is looking for ' . mail_escape(mail_category($quote, 'entertainment')) . ' in ' . mail_escape($where) . '.';

    return mail_frame($heading, $intro, $body);
}

/**
 * The receipt the parent gets: what they asked for, who has it, and what happens next.
 * It promises nothing the site cannot keep — there is no SLA behind this inbox — and it
 * carries the same answers so they can check a typo while it is still easy to correct.
 */
function quote_request_receipt_html(array $quote, ?array $vendor): string
{
    $name = mail_value($quote, 'name', 'there');

    $sent = mail_row('Date', mail_value($quote, 'event_date'))
        . mail_row('City', mail_value($quote, 'city'))
        . mail_row('Children', mail_value($quote, 'guest_count'))
        . mail_row('Ages', mail_value($quote, 'child_age'))
        . mail_row('Event type', mail_value($quote, 'event_type'))
        . mail_row('Entertainment', mail_category($quote))
        . mail_row('Budget', mail_value($quote, 'budget'));

    $recipient = '';
    if ($vendor !== null) {
        $recipient = '<p style="margin:0 0 8px 0;font-size:15px;line-height:1.65;">Your request has gone to '
            . '<strong>' . mail_escape(mail_name($vendor)) . '</strong>.</p>';
        $website = trim((string) ($vendor['website'] ?? ''));
        if ($website !== '') {
            $recipient .= ' You can also look at their website at '
                . '<a href="' . mail_escape($website) . '" style="color:' . MAIL_COLOURS['primary'] . ';">'
                . mail_escape(parse_url($website, PHP_URL_HOST) ?: $website) . '</a>.';
        }
        $recipient .= '</p>';
    }

    $body = '<p style="margin:0 0 12px 0;font-size:16px;line-height:1.65;">Hi ' . mail_escape($name) . ',</p>'
        . '<p style="margin:0 0 8px 0;font-size:15px;line-height:1.65;">'
        . 'Thanks for using Hire Party Characters. We have your quote request, and it has been passed on'
        . ($vendor === null ? ' to the businesses that match what you described.' : ' straight to the business you chose.')
        . '</p>'
        . $recipient
        . '<p style="margin:0 0 18px 0;font-size:15px;line-height:1.65;">'
        . 'The business answers you directly, usually by email or phone. There is nothing to pay and nothing to'
        . ' confirm until you agree a price with them — so you are not committed to booking.</p>'
        . mail_listing_pill($vendor)
        . mail_panel($sent, 'What you asked for')
        . mail_panel(mail_row('What you told us', mail_value($quote, 'details', '(left blank)'), true))
        . '<p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:' . MAIL_COLOURS['muted'] . ';">'
        . 'If something above is wrong, reply to this email and tell us — we can correct the request before'
        . ' the business acts on it.</p>'
        . mail_button(MAIL_SITE . '/search', 'Keep looking at other businesses');

    $heading = 'Your quote request is on its way';
    $intro = $vendor === null
        ? 'We have sent it to the businesses that match your party.'
        : 'It has been sent to ' . mail_escape(mail_name($vendor)) . '.';

    return mail_frame($heading, $intro, $body, 'You are receiving this because you asked for a quote on our directory.');
}

/** The plain-text twin of the parent's receipt, for clients that show no HTML. */
function quote_request_receipt_text(array $quote, ?array $vendor): string
{
    $value = static fn (string $key, string $fallback = '—'): string => trim((string) ($quote[$key] ?? '')) ?: $fallback;

    $lines = [];
    $lines[] = 'Hi ' . $value('name', 'there') . ',';
    $lines[] = '';
    $lines[] = 'Thanks for using Hire Party Characters. We have your quote request.';
    $lines[] = $vendor === null
        ? 'It has been passed on to the businesses that match your party.'
        : 'It has gone straight to ' . mail_name($vendor) . '.';
    $lines[] = '';
    $lines[] = 'What you asked for:';
    $lines[] = '  Date:          ' . $value('event_date');
    $lines[] = '  City:          ' . $value('city');
    $lines[] = '  Children:      ' . $value('guest_count');
    $lines[] = '  Ages:          ' . $value('child_age');
    $lines[] = '  Event type:    ' . $value('event_type');
    $lines[] = '  Entertainment: ' . mail_category($quote);
    $lines[] = '  Budget:        ' . $value('budget');
    $lines[] = '';
    $lines[] = 'What you told us:';
    $lines[] = $value('details', '(left blank)');
    $lines[] = '';
    $lines[] = 'The business answers you directly, usually by email or phone. There is nothing to pay';
    $lines[] = 'and nothing to confirm until you agree a price with them.';
    $lines[] = '';
    $lines[] = 'If something above is wrong, reply to this email and tell us.';
    $lines[] = '';
    $lines[] = '— hirepartycharacters.com';

    return implode("\n", $lines);
}

/**
 * Tells the listing and the operator about a quote request, and thanks the parent.
 *
 * Never throws: the request is already stored, and losing the visitor's answers to a
 * mail-server hiccup would be worse than a notification that did not go out. The two
 * messages are sent separately because a parent must not learn an admin's address, and
 * an admin must not have to filter the parent's copy out of their own inbox.
 */
function notify_quote_request(array $quote, ?array $vendor, array $also = []): array
{
    $settings = mail_settings();
    if ($settings === null) {
        return ['ok' => false, 'error' => 'no mail-config.php'];
    }

    $recipients = quote_request_recipients($settings, $vendor, $also);
    if ($recipients === []) {
        return ['ok' => false, 'error' => 'no recipient'];
    }

    $where = trim((string) ($quote['city'] ?? ''));
    $subject = 'New quote request' . ($where === '' ? '' : " in $where");
    if ($vendor !== null && ($vendor['name'] ?? '') !== '') {
        $subject .= ' — ' . $vendor['name'];
    }

    $result = smtp_send_text($settings, [
        'to' => $recipients,
        'subject' => $subject,
        'text' => quote_request_text($quote, $vendor),
        'html' => quote_request_html($quote, $vendor),
        'replyTo' => (string) ($quote['email'] ?? ''),
    ]);

    if (!$result['ok']) {
        error_log('[quote-mail] ' . $result['error']);
        return $result;
    }

    // The parent's receipt is sent after the notification and cannot fail the request:
    // if it bounces, the business still has the lead, which is the part that matters.
    $parent = trim((string) ($quote['email'] ?? ''));
    if ($parent !== '' && filter_var($parent, FILTER_VALIDATE_EMAIL) !== false) {
        $receipt = smtp_send_text($settings, [
            'to' => [$parent],
            'subject' => $vendor === null
                ? 'Your quote request is with our businesses'
                : 'Your quote request to ' . (string) ($vendor['name'] ?? ''),
            'text' => quote_request_receipt_text($quote, $vendor),
            'html' => quote_request_receipt_html($quote, $vendor),
            'replyTo' => (string) ($settings['notify_email'] ?? $settings['from_email'] ?? ''),
        ]);
        if (!$receipt['ok']) {
            error_log('[quote-receipt] ' . $receipt['error']);
        }
        $result['receipt'] = $receipt;
    }

    return $result;
}