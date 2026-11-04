<?php
declare(strict_types=1);

/**
 * Proves the outgoing mailbox works, from the server that will use it.
 *
 *   php deploy/tools/send-test-mail.php                  send to notify_email
 *   php deploy/tools/send-test-mail.php you@example.com  send somewhere else
 *   php deploy/tools/send-test-mail.php you@example.com quote   the real quote email
 *
 * It prints every step the SMTP conversation reached, so a failure names the step that
 * failed instead of leaving you guessing. Nothing is written to the database.
 *
 * The "quote" mode sends the actual notification and receipt built from a fixture, so
 * the layout can be judged in a real inbox before a visitor ever sees it.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo 'This tool only runs from the command line.';
    exit(1);
}

// The tool sits in deploy/tools/ in the repository and in the site's tools/ on the host,
// so the API folder is one of these two.
foreach ([dirname(__DIR__) . '/public/api/mailer.php', dirname(__DIR__) . '/public_html/api/mailer.php'] as $mailer) {
    if (is_file($mailer)) {
        require_once $mailer;
        break;
    }
}
if (!function_exists('smtp_send_text')) {
    fwrite(STDERR, "Could not find public/api/mailer.php next to this folder.\n");
    exit(1);
}

$settings = mail_settings();
if ($settings === null) {
    fwrite(STDERR, "No mail-config.php next to db-config.php — nothing to test.\n");
    exit(1);
}

$to = $argv[1] ?? (string) ($settings['notify_email'] ?? $settings['username']);
$mode = $argv[2] ?? 'plain';
if (filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
    fwrite(STDERR, "Not an email address: $to\n");
    exit(1);
}

$host = (string) $settings['host'];
$port = (int) ($settings['port'] ?? 465);
echo "host     $host:$port\n";
echo "user     {$settings['username']}\n";
echo "from     {$settings['from_email']} ({$settings['from_name']})\n";
echo "to       $to\n";
echo "mode     $mode\n\n";

if ($mode === 'quote') {
    // A fixture, labelled as one in the subject, so nobody mistakes it for a real lead.
    $vendor = [
        'name' => 'The Princess Party Co.',
        'slug' => 'the-princess-party-co',
        'city_name' => 'Chicago',
        'state_code' => 'IL',
        'category_name' => 'Princesses',
        'website' => MAIL_SITE,
    ];
    $quote = [
        'id' => 0,
        'name' => 'Amelia Hartley',
        'email' => $to,
        'phone' => '(312) 555-0147',
        'city' => 'Chicago',
        'event_date' => '2026-12-13',
        'guest_count' => '14',
        'child_age' => '4-7',
        'event_type' => 'Birthday party',
        'category_slug' => 'Princesses',
        'budget' => '$400 – $700',
        'details' => "Isla is turning six and is mad about anything with a crown. She would love a\nprincess who can sing — the cake is at 3pm and we have a small back garden.",
    ];

    foreach ([
        'notification (what the business and admins get)' => [
            'subject' => '[TEST] New quote request in Chicago — The Princess Party Co.',
            'text' => quote_request_text($quote, $vendor),
            'html' => quote_request_html($quote, $vendor),
        ],
        'receipt (what the parent gets)' => [
            'subject' => '[TEST] Your quote request to The Princess Party Co',
            'text' => quote_request_receipt_text($quote, $vendor),
            'html' => quote_request_receipt_html($quote, $vendor),
        ],
    ] as $label => $message) {
        $result = smtp_send_text($settings, $message + ['to' => [$to]]);
        echo str_pad($label, 50), $result['ok'] ? 'SENT ' . ($result['id'] ?? '') : 'FAILED: ' . $result['error'], "\n";
    }
    exit(0);
}

$result = smtp_send_text($settings, [
    'to' => [$to],
    'subject' => 'SMTP test from hirepartycharacters.com',
    'text' => implode("\n", [
        'This is a test message from the Hire Party Characters server.',
        'If it arrived, quote requests can reach this inbox.',
        '',
        'Sent ' . date('r'),
    ]),
]);

if ($result['ok']) {
    echo "SENT\n";
    echo 'queue id ' . ($result['id'] ?? '(not reported)') . "\n";
    exit(0);
}

fwrite(STDERR, 'FAILED: ' . $result['error'] . "\n");
exit(1);