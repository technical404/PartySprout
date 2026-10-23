<?php
declare(strict_types=1);

/**
 * Proves the outgoing mailbox works, from the server that will use it.
 *
 *   php deploy/tools/send-test-mail.php                  send to notify_email
 *   php deploy/tools/send-test-mail.php you@example.com  send somewhere else
 *
 * It prints every step the SMTP conversation reached, so a failure names the step that
 * failed instead of leaving you guessing. Nothing is written to the database.
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
if (filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
    fwrite(STDERR, "Not an email address: $to\n");
    exit(1);
}

$host = (string) $settings['host'];
$port = (int) ($settings['port'] ?? 465);
echo "host     $host:$port\n";
echo "user     {$settings['username']}\n";
echo "from     {$settings['from_email']} ({$settings['from_name']})\n";
echo "to       $to\n\n";

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