<?php
/**
 * Template for the outgoing mailbox used by the PHP API and its tools.
 *
 * Copy this file to mail-config.php in the SAME folder — deploy/mail-config.php, which
 * maps to the site root, outside public_html — and fill in the real values. Never put
 * the real file inside deploy/public/: web-root files are uploaded and served.
 *
 * With no mail-config.php the deployment sends no mail (quote requests are still stored
 * and still visible in the admin console). Local development therefore has none.
 *
 * Check it from the server with:
 *   php tools/send-test-mail.php you@example.com
 */
return [
    // Implicit TLS only (port 465). Port 587 with STARTTLS is not implemented.
    'host' => 'mail.example.com',
    'port' => 465,
    'username' => 'mailer@example.com',
    'password' => 'your_mailbox_password',

    // What recipients see. Keep this on the mailbox's own domain, or the message will
    // fail the domain's SPF check and land in spam.
    'from_email' => 'mailer@example.com',
    'from_name' => 'Hire Party Characters',

    // Every quote request goes here as well, and everything goes here when the listing
    // has no address of its own.
    'notify_email' => 'mailer@example.com',

    // Seconds to wait for the connection and for each reply.
    'timeout' => 8,
];
