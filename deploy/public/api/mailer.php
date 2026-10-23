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
 * Sends one plain-text message.
 *
 * $mail: to (list), subject, text, replyTo (optional).
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
            'Content-Type: text/plain; charset=utf-8',
            'Content-Transfer-Encoding: base64',
            // Marks the mail as its own: a stray auto-reply cannot start a loop.
            'Auto-Submitted: auto-generated',
        ];
        $replyTo = trim((string) ($mail['replyTo'] ?? ''));
        if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL) !== false) {
            $headers[] = 'Reply-To: ' . $replyTo;
        }

        $body = rtrim(str_replace(["\r\n", "\r"], "\n", (string) ($mail['text'] ?? '')), "\n");
        $encoded = chunk_split(base64_encode($body), 76, "\r\n");
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
 * Who hears about a quote request: the listing's own address when it has one, and the
 * operator's inbox otherwise. The operator always gets a copy, so no request is lost
 * when a listing's address is wrong or missing.
 */
function quote_request_recipients(array $settings, ?array $vendor): array
{
    $notify = trim((string) ($settings['notify_email'] ?? ''));
    $business = trim((string) ($vendor['email'] ?? ''));
    $recipients = [];
    if ($business !== '' && filter_var($business, FILTER_VALIDATE_EMAIL) !== false) {
        $recipients[] = $business;
    }
    if ($notify !== '' && !in_array(strtolower($notify), array_map('strtolower', $recipients), true)) {
        $recipients[] = $notify;
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
        $lines[] = 'Listing:  ' . ($vendor['name'] ?? '') . ' (' . ($vendor['slug'] ?? '') . ')';
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
    $lines[] = 'Looking for: ' . $value('category_slug');
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
 * Tells the listing and the operator about a quote request.
 *
 * Never throws: the request is already stored, and losing the visitor's answers to a
 * mail-server hiccup would be worse than a notification that did not go out.
 */
function notify_quote_request(array $quote, ?array $vendor): array
{
    $settings = mail_settings();
    if ($settings === null) {
        return ['ok' => false, 'error' => 'no mail-config.php'];
    }

    $recipients = quote_request_recipients($settings, $vendor);
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
        'replyTo' => (string) ($quote['email'] ?? ''),
    ]);

    if (!$result['ok']) {
        error_log('[quote-mail] ' . $result['error']);
    }
    return $result;
}