<?php
declare(strict_types=1);

/**
 * Sets (or resets) the password of an account in the production MySQL database.
 *
 *   php deploy/tools/set-password.php someone@example.com 'a-good-password'
 *   php deploy/tools/set-password.php --create admin@example.com 'a-good-password' admin "Admin"
 *
 * Passwords written by the Node development app use PBKDF2, which this file can
 * verify; anything older (scrypt) has to be reset once here. The hash format and
 * the iteration count match Database/auth.js exactly, so a password set on
 * either side works on both.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo 'This tool only runs from the command line.';
    exit(1);
}

$args = array_slice($argv, 1);
$create = false;
if (($args[0] ?? '') === '--create') {
    $create = true;
    array_shift($args);
}

[$email, $password, $role, $name] = array_pad($args, 4, null);

if (!$email || !$password) {
    fwrite(STDERR, "usage: php set-password.php [--create] <email> <password> [role] [name]\n");
    exit(1);
}

if (strlen((string) $password) < 8) {
    fwrite(STDERR, "Please use at least 8 characters.\n");
    exit(1);
}

$configPath = dirname(__DIR__, 2) . '/db-config.php';
if (!is_file($configPath)) {
    $configPath = dirname(__DIR__, 2) . '/public/api/db-config.php';
}
if (!is_file($configPath)) {
    fwrite(STDERR, "Could not find db-config.php next to public_html.\n");
    exit(1);
}

$config = require $configPath;
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$db = new mysqli($config['host'] ?? 'localhost', $config['user'], $config['password'], $config['database']);
$db->set_charset('utf8mb4');

$email = strtolower(trim((string) $email));
$iterations = 210000;
$salt = random_bytes(16);
$key = hash_pbkdf2('sha256', (string) $password, $salt, $iterations, 0, true);
$hash = 'pbkdf2$sha256$' . $iterations . '$' . base64_encode($salt) . '$' . base64_encode($key);

$existing = $db->prepare('SELECT id FROM users WHERE email = ?');
$existing->bind_param('s', $email);
$existing->execute();
$row = $existing->get_result()->fetch_assoc();

if ($row) {
    $update = $db->prepare('UPDATE users SET password_hash = ?, status = \'active\' WHERE id = ?');
    $update->bind_param('si', $hash, $row['id']);
    $update->execute();
    echo "Password updated for {$email} (user {$row['id']}).\n";
    // Old sessions belong to the previous password; making someone sign in again
    // is the point of a reset.
    $id = (int) $row['id'];
    $kill = $db->prepare('DELETE FROM sessions WHERE user_id = ?');
    $kill->bind_param('i', $id);
    $kill->execute();
    echo "Signed out that account's existing sessions.\n";
    exit(0);
}

if (!$create) {
    fwrite(STDERR, "No account with that email. Add --create to make one.\n");
    exit(1);
}

$role = in_array($role, ['parent', 'vendor', 'admin'], true) ? $role : 'parent';
$name = $name ?: $email;
$insert = $db->prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)');
$insert->bind_param('ssss', $email, $name, $hash, $role);
$insert->execute();
echo "Created {$role} account {$email} (user {$db->insert_id}).\n";
