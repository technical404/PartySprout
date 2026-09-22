<?php
declare(strict_types=1);

/**
 * Party Spark API for the SiteGround (PHP + MySQL) deployment.
 *
 * This file mirrors Database/api-handler.cjs route for route, including the
 * validation messages and response shapes, so the same SPA talks to either
 * backend. When you change one, change the other — .ohmyagent/check_php_parity.mjs
 * fails if the two route tables drift apart.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

/*
 * Tools and the local self-test can include this file for its helpers with no
 * database behind it: define PARTYSPARK_LIB_ONLY before the include. Everything
 * below the helpers is skipped in that mode, so nothing connects or routes.
 */
if (!defined('PARTYSPARK_LIB_ONLY')) {
    $configPath = dirname(__DIR__, 2) . '/db-config.php';
    if (!is_file($configPath)) {
        $configPath = __DIR__ . '/db-config.php';
    }
    if (!is_file($configPath)) {
        http_response_code(500);
        echo json_encode(['error' => 'Server error']);
        exit;
    }

    $config = require $configPath;

    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

    try {
        $db = new mysqli(
            $config['host'] ?? 'localhost',
            $config['user'],
            $config['password'],
            $config['database']
        );
        $db->set_charset('utf8mb4');
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Server error']);
        exit;
    }
}

/* ------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* ------------------------------------------------------------------------- */

const SESSION_COOKIE = 'ps_session';
const SESSION_DAYS = 30;
const MAX_FIELD = 2000;
const EMAIL_PATTERN = '/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/';
/** PBKDF2-HMAC-SHA256. Node writes the same format, so hashes move either way. */
const PBKDF2_ITERATIONS = 210000;

function send(int $status, $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Prepares a statement and binds parameters, inferring each type from the PHP
 * value. Values that are null are sent as SQL NULL, which is how optional
 * columns stay empty.
 */
function bound_statement(mysqli $db, string $sql, array $params): mysqli_stmt
{
    $stmt = $db->prepare($sql);
    if ($params !== []) {
        $types = '';
        foreach ($params as $value) {
            if (is_int($value)) {
                $types .= 'i';
            } elseif (is_float($value)) {
                $types .= 'd';
            } else {
                $types .= 's';
            }
        }
        $stmt->bind_param($types, ...$params);
    }
    return $stmt;
}

/** SELECT helper. Returns null when the statement produces no result set. */
function run_select(mysqli $db, string $sql, array $params = []): ?mysqli_result
{
    $stmt = bound_statement($db, $sql, $params);
    $stmt->execute();
    if ($stmt->field_count === 0) {
        return null;
    }
    $result = $stmt->get_result();
    return $result === false ? null : $result;
}

function fetch_all(mysqli $db, string $sql, array $params = []): array
{
    $result = run_select($db, $sql, $params);
    if ($result === null) {
        return [];
    }
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    return $rows;
}

function fetch_one(mysqli $db, string $sql, array $params = []): ?array
{
    $rows = fetch_all($db, $sql, $params);
    return $rows[0] ?? null;
}

function fetch_value(mysqli $db, string $sql, array $params = [])
{
    $row = fetch_one($db, $sql, $params);
    if ($row === null) {
        return null;
    }
    return array_values($row)[0] ?? null;
}

/** INSERT/UPDATE/DELETE, returning the affected row count. */
function run_write(mysqli $db, string $sql, array $params = []): int
{
    $stmt = bound_statement($db, $sql, $params);
    $stmt->execute();
    return $stmt->affected_rows;
}

function read_json_body(int $limit = 64 * 1024): array
{
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > $limit) {
        send(400, ['error' => 'Payload too large']);
    }
    if (trim($raw) === '') {
        return [];
    }
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        send(400, ['error' => 'Invalid JSON']);
    }
    return $body;
}

function text($value): string
{
    return trim((string) ($value ?? ''));
}

function nullable_text($value): ?string
{
    $clean = text($value);
    return $clean === '' ? null : $clean;
}

function normalize_email($email): string
{
    return strtolower(text($email));
}

/** Absolute http(s) links only — these end up in href/src attributes. */
function safe_url($value): ?string
{
    $raw = text($value);
    if ($raw === '') {
        return null;
    }
    if (strpos($raw, '://') === false) {
        $raw = 'https://' . $raw;
    }
    if (!filter_var($raw, FILTER_VALIDATE_URL)) {
        return null;
    }
    $scheme = strtolower((string) parse_url($raw, PHP_URL_SCHEME));
    return ($scheme === 'http' || $scheme === 'https') ? $raw : null;
}

/** null when the field was blank; false when it is not a usable price. */
function to_price($value)
{
    if ($value === '' || $value === null) {
        return null;
    }
    if (!is_numeric($value)) {
        return false;
    }
    $number = (float) $value;
    if ($number < 0 || $number > 100000) {
        return false;
    }
    return (int) round($number);
}

function client_key(): string
{
    $forwarded = trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))[0]);
    return $forwarded !== '' ? $forwarded : (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

/**
 * Coarse throttle for the endpoints worth guessing at (login) and the ones worth
 * spamming (quote requests). Shared between PHP workers through a small file per
 * bucket, because PHP keeps no memory across requests.
 */
function throttle(string $name, int $max, int $windowSeconds): bool
{
    $dir = sys_get_temp_dir() . '/partyspark-throttle';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return true;
    }
    $file = $dir . '/' . hash('sha256', $name . ':' . client_key()) . '.json';
    $handle = @fopen($file, 'c+');
    if ($handle === false) {
        return true;
    }
    $allowed = true;
    try {
        flock($handle, LOCK_EX);
        $now = time();
        $entry = json_decode((string) stream_get_contents($handle), true);
        if (!is_array($entry) || ($entry['resetAt'] ?? 0) < $now) {
            $entry = ['count' => 0, 'resetAt' => $now + $windowSeconds];
        }
        $entry['count'] = (int) $entry['count'] + 1;
        $allowed = $entry['count'] <= $max;
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, json_encode($entry));
        fflush($handle);
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
    return $allowed;
}

/* ------------------------------------------------------------------------- */
/* Passwords and sessions                                                     */
/* ------------------------------------------------------------------------- */

function hash_password(string $password): string
{
    $salt = random_bytes(16);
    // No explicit length: PBKDF2 with binary output returns the full digest, 32
    // bytes for sha256, which is the key length Database/auth.js uses too.
    $key = hash_pbkdf2('sha256', $password, $salt, PBKDF2_ITERATIONS, 0, true);
    return 'pbkdf2$sha256$' . PBKDF2_ITERATIONS . '$' . base64_encode($salt) . '$' . base64_encode($key);
}

/** Returns 'scrypt' when the row was hashed by the Node side and needs resetting. */
function verify_password(string $password, string $stored): string
{
    $parts = explode('$', $stored);
    if ($parts[0] === 'pbkdf2' && count($parts) === 5) {
        $iterations = (int) $parts[2];
        $salt = base64_decode($parts[3], true);
        $expected = base64_decode($parts[4], true);
        // 32 bytes is what sha256 yields; anything else was not written by us.
        if ($salt === false || $expected === false || strlen($expected) !== 32 || $iterations < 1000) {
            return 'no';
        }
        $key = hash_pbkdf2('sha256', $password, $salt, $iterations, 0, true);
        return hash_equals($expected, $key) ? 'yes' : 'no';
    }
    // Hashes made elsewhere (a bcrypt/argon2 row from another tool) still work.
    if (strncmp($parts[0], '$2', 2) === 0 || strncmp($parts[0], '$argon', 6) === 0) {
        return password_verify($password, $stored) ? 'yes' : 'no';
    }
    if ($parts[0] === 'scrypt') {
        return 'scrypt';
    }
    return 'no';
}

function session_cookie(string $token, int $maxAge = SESSION_DAYS * 86400): void
{
    $forwarded = strtolower(trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0]));
    $secure = $forwarded === 'https' || (($_SERVER['HTTPS'] ?? 'off') !== 'off');
    setcookie(SESSION_COOKIE, $token, [
        'expires' => $maxAge === 0 ? time() - 3600 : time() + $maxAge,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => $secure,
    ]);
}

function create_session(mysqli $db, int $userId): string
{
    $token = bin2hex(random_bytes(32));
    $expires = (new DateTimeImmutable('+' . SESSION_DAYS . ' days'))->format('Y-m-d H:i:s');
    run_write($db, 'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [$token, $userId, $expires]);
    return $token;
}

function current_user(mysqli $db): ?array
{
    $token = (string) ($_COOKIE[SESSION_COOKIE] ?? '');
    if ($token === '') {
        return null;
    }
    $session = fetch_one($db, 'SELECT token, user_id, expires_at FROM sessions WHERE token = ?', [$token]);
    if ($session === null) {
        return null;
    }
    if (strtotime((string) $session['expires_at']) <= time()) {
        run_write($db, 'DELETE FROM sessions WHERE token = ?', [$token]);
        return null;
    }
    return fetch_one(
        $db,
        "SELECT u.id, u.email, u.name, u.phone, u.role, u.listing_id, u.status
           FROM users u WHERE u.id = ? AND u.status = 'active'",
        [(int) $session['user_id']]
    );
}

function public_user(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'email' => $user['email'],
        'name' => $user['name'],
        'phone' => $user['phone'] ?? null,
        'role' => $user['role'],
        'listingId' => $user['listing_id'] === null ? null : (int) $user['listing_id'],
    ];
}

/* ------------------------------------------------------------------------- */
/* Directory queries                                                          */
/* ------------------------------------------------------------------------- */

function category_by_slug(mysqli $db, string $slug): ?array
{
    return fetch_one($db, 'SELECT * FROM categories WHERE slug = ? AND is_active = 1', [$slug]);
}

function city_by_id(mysqli $db, int $id): ?array
{
    return fetch_one(
        $db,
        'SELECT ci.id, ci.name, ci.slug, ci.state_id, s.code AS state_code, s.country_id
           FROM cities ci JOIN states s ON s.id = ci.state_id
          WHERE ci.id = ?',
        [$id]
    );
}

function country_by_code(mysqli $db, string $code): ?array
{
    return fetch_one(
        $db,
        'SELECT id, code, name FROM countries WHERE code = ? AND is_active = 1',
        [strtoupper($code)]
    );
}

function build_filters(array $filters): array
{
    $where = ["l.status = 'active'"];
    $params = [];

    if (!empty($filters['q'])) {
        $where[] = '(l.name LIKE ? OR l.description LIKE ?)';
        $like = '%' . $filters['q'] . '%';
        $params[] = $like;
        $params[] = $like;
    }
    $categoryIds = [];
    if (!empty($filters['categoryIds']) && is_array($filters['categoryIds'])) {
        foreach ($filters['categoryIds'] as $id) {
            $id = (int) $id;
            if ($id > 0) {
                $categoryIds[] = $id;
            }
        }
    } elseif (!empty($filters['categoryId'])) {
        $categoryIds[] = (int) $filters['categoryId'];
    }
    if ($categoryIds) {
        $placeholders = implode(',', array_fill(0, count($categoryIds), '?'));
        $where[] = "EXISTS (SELECT 1 FROM listing_categories lc WHERE lc.listing_id = l.id AND lc.category_id IN ($placeholders))";
        foreach ($categoryIds as $id) {
            $params[] = $id;
        }
    }
    if (isset($filters['priceMin'])) {
        // Businesses with no published price cannot claim to be under a budget.
        $where[] = 'l.price_from IS NOT NULL AND l.price_from >= ?';
        $params[] = $filters['priceMin'];
    }
    if (isset($filters['priceMax'])) {
        $where[] = 'l.price_from IS NOT NULL AND l.price_from <= ?';
        $params[] = $filters['priceMax'];
    }
    if (isset($filters['ratingMin'])) {
        $where[] = 'l.rating IS NOT NULL AND l.rating >= ?';
        $params[] = $filters['ratingMin'];
    }
    if (!empty($filters['featuredOnly'])) {
        $where[] = 'l.is_featured = 1';
    }
    if (!empty($filters['cityId'])) {
        $where[] = 'l.city_id = ?';
        $params[] = (int) $filters['cityId'];
    }
    if (!empty($filters['city'])) {
        // The reference city, the free-text city a submission typed, or a state
        // code. Deliberately not l.name: "Dallas Heroes" is not a Dallas hit.
        $where[] = '(ci.name LIKE ? OR l.city_text LIKE ? OR s.code = ?)';
        $like = '%' . $filters['city'] . '%';
        $params[] = $like;
        $params[] = $like;
        $params[] = strtoupper((string) $filters['city']);
    }
    if (!empty($filters['ownerId'])) {
        $where[] = 'l.submitted_by = ?';
        $params[] = (int) $filters['ownerId'];
    }
    if (!empty($filters['status'])) {
        $where[] = 'l.status = ?';
        $params[] = $filters['status'];
    }

    return ['clause' => implode(' AND ', $where), 'params' => $params];
}

/** Whitelisted sort keys, so a query parameter can never inject SQL. */
function order_clause(?string $sort): string
{
    $sorts = [
        'relevance' => 'l.is_featured DESC, l.name',
        'name' => 'l.name',
        'price_asc' => 'l.price_from IS NULL, l.price_from ASC, l.name',
        'price_desc' => 'l.price_from IS NULL, l.price_from DESC, l.name',
        'rating' => 'l.rating IS NULL, l.rating DESC, l.name',
        'newest' => 'l.created_at DESC, l.id DESC',
    ];
    return $sorts[$sort ?? ''] ?? $sorts['relevance'];
}

/**
 * The one place listing rows are shaped for the UI, matching selectListings()
 * in Database/queries.js column for column.
 */
function select_listings(mysqli $db, string $whereSql, array $params, string $order = 'l.name', ?int $limit = null, int $offset = 0): array
{
    $paged = $limit === null ? '' : ' LIMIT ? OFFSET ?';
    $args = $limit === null ? $params : array_merge($params, [$limit, $offset]);
    $rows = fetch_all(
        $db,
        "SELECT l.id, l.name, l.slug, l.description, l.website, l.icon_url, l.phone, l.price_from, l.rating, l.is_featured,
                l.status, l.created_at,
                c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
                COALESCE(ci.name, l.city_text) AS city_name,
                CASE WHEN ci.id IS NULL THEN NULL ELSE s.code END AS state_code,
                co.code AS country_code
           FROM listings l
           JOIN categories c ON c.id = l.category_id
           JOIN countries  co ON co.id = l.country_id
           LEFT JOIN cities ci ON ci.id = l.city_id
           LEFT JOIN states s  ON s.id  = l.state_id
          WHERE $whereSql
          ORDER BY $order$paged",
        $args
    );
    return array_map('shape_listing', $rows);
}

function shape_listing(array $row): array
{
    $row['id'] = (int) $row['id'];
    $row['is_featured'] = (int) $row['is_featured'];
    $row['price_from'] = $row['price_from'] === null ? null : (float) $row['price_from'];
    $row['rating'] = $row['rating'] === null ? null : (float) $row['rating'];
    return $row;
}

function listing_by_slug(mysqli $db, string $slug): ?array
{
    $row = fetch_one(
        $db,
        "SELECT l.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
                COALESCE(ci.name, l.city_text) AS city_name,
                CASE WHEN ci.id IS NULL THEN NULL ELSE s.code END AS state_code,
                co.name AS country_name
           FROM listings l
           JOIN categories c ON c.id = l.category_id
           JOIN countries  co ON co.id = l.country_id
           LEFT JOIN cities ci ON ci.id = l.city_id
           LEFT JOIN states s  ON s.id  = l.state_id
          WHERE l.slug = ? AND l.status = 'active'",
        [$slug]
    );
    return $row === null ? null : shape_listing($row);
}

/** Owner/admin lookup that also returns pending and rejected rows. */
function listing_by_id(mysqli $db, int $id): ?array
{
    $row = fetch_one(
        $db,
        "SELECT l.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
                COALESCE(ci.name, l.city_text) AS city_name,
                CASE WHEN ci.id IS NULL THEN NULL ELSE s.code END AS state_code
           FROM listings l
           JOIN categories c ON c.id = l.category_id
           LEFT JOIN cities ci ON ci.id = l.city_id
           LEFT JOIN states s  ON s.id  = l.state_id
          WHERE l.id = ?",
        [$id]
    );
    return $row === null ? null : shape_listing($row);
}

function unique_listing_slug(mysqli $db, string $name): string
{
    $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)) ?? '', '-');
    if ($base === '') {
        $base = 'business';
    }
    $slug = $base;
    $n = 2;
    while (fetch_one($db, 'SELECT 1 FROM listings WHERE slug = ?', [$slug]) !== null) {
        $slug = $base . '-' . $n;
        $n++;
    }
    return $slug;
}

function add_listing_category(mysqli $db, int $listingId, int $categoryId): void
{
    run_write($db, 'INSERT IGNORE INTO listing_categories (listing_id, category_id) VALUES (?, ?)', [$listingId, $categoryId]);
}

function listing_categories(mysqli $db, int $listingId): array
{
    $rows = fetch_all(
        $db,
        "SELECT c.id, c.slug, c.name, c.icon
           FROM listing_categories lc
           JOIN categories c ON c.id = lc.category_id
          WHERE lc.listing_id = ?
          ORDER BY c.sort_order",
        [$listingId]
    );
    return array_map(static function (array $row): array {
        $row['id'] = (int) $row['id'];
        return $row;
    }, $rows);
}

function favorite_ids(mysqli $db, int $userId): array
{
    $rows = fetch_all(
        $db,
        'SELECT listing_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC, listing_id DESC',
        [$userId]
    );
    return array_map(static fn(array $row): int => (int) $row['listing_id'], $rows);
}

/* ------------------------------------------------------------------------- */
/* Route handlers                                                             */
/* ------------------------------------------------------------------------- */

function handle_auth(mysqli $db, string $method, string $path): bool
{
    if ($method === 'GET' && $path === '/api/auth/me') {
        $user = current_user($db);
        send(200, ['user' => $user === null ? null : public_user($user)]);
    }

    if ($method === 'POST' && $path === '/api/auth/logout') {
        $token = (string) ($_COOKIE[SESSION_COOKIE] ?? '');
        if ($token !== '') {
            run_write($db, 'DELETE FROM sessions WHERE token = ?', [$token]);
        }
        session_cookie('', 0);
        send(200, ['ok' => true]);
    }

    if ($method === 'POST' && $path === '/api/auth/signup') {
        if (!throttle('signup', 10, 15 * 60)) {
            send(429, ['error' => 'Too many attempts. Please try again in a few minutes.']);
        }
        $body = read_json_body();
        $email = normalize_email($body['email'] ?? '');
        $name = text($body['name'] ?? '');
        $password = (string) ($body['password'] ?? '');

        $errors = [];
        if ($email === '') {
            $errors['email'] = 'Please enter your email.';
        } elseif (!preg_match(EMAIL_PATTERN, $email)) {
            $errors['email'] = 'Enter a valid email address.';
        } elseif (strlen($email) > MAX_FIELD) {
            $errors['email'] = 'Email is too long.';
        }
        if (strlen($password) < 8) {
            $errors['password'] = 'Use at least 8 characters.';
        } elseif (strlen($password) > 200) {
            $errors['password'] = 'Password is too long.';
        }
        // Admins are promoted deliberately (Database/create-admin.cjs), never here.
        $role = text($body['role'] ?? '') === 'vendor' ? 'vendor' : 'parent';

        if (fetch_one($db, 'SELECT id FROM users WHERE email = ?', [$email]) !== null) {
            $errors['email'] = 'An account with this email already exists. Try logging in instead.';
        }
        if ($errors !== []) {
            send(422, ['error' => 'Validation failed', 'fields' => $errors]);
        }

        run_write(
            $db,
            'INSERT INTO users (email, name, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
            [$email, $name, nullable_text($body['phone'] ?? ''), hash_password($password), $role]
        );
        $userId = (int) $db->insert_id;
        $token = create_session($db, $userId);
        session_cookie($token);
        $user = fetch_one($db, 'SELECT id, email, name, phone, role, listing_id, status FROM users WHERE id = ?', [$userId]);
        send(201, ['user' => public_user($user)]);
    }

    if ($method === 'POST' && $path === '/api/auth/login') {
        if (!throttle('login', 10, 15 * 60)) {
            send(429, ['error' => 'Too many attempts. Please try again in a few minutes.']);
        }
        $body = read_json_body();
        $email = normalize_email($body['email'] ?? '');
        $password = (string) ($body['password'] ?? '');

        $errors = [];
        if ($email === '') {
            $errors['email'] = 'Please enter your email.';
        }
        if ($password === '') {
            $errors['password'] = 'Please enter your password.';
        }
        if ($errors !== []) {
            send(422, ['error' => 'Validation failed', 'fields' => $errors]);
        }

        $user = fetch_one($db, 'SELECT * FROM users WHERE email = ?', [$email]);
        // One message for both cases: never reveal which emails have accounts.
        $check = ($user === null || ($user['status'] ?? 'active') !== 'active')
            ? 'no'
            : verify_password($password, (string) $user['password_hash']);

        if ($check === 'scrypt') {
            // Hashes written by the Node/dev database. Phoenix can verify scrypt,
            // PHP cannot, so these accounts need a one-time password reset.
            send(401, ['error' => 'This account still uses a development password. Reset it with deploy/tools/set-password.php.']);
        }
        if ($check !== 'yes') {
            send(401, ['error' => 'That email and password combination did not work.']);
        }

        $token = create_session($db, (int) $user['id']);
        session_cookie($token);
        send(200, ['user' => public_user($user)]);
    }

    if ($method === 'PATCH' && $path === '/api/auth/me') {
        $user = current_user($db);
        if ($user === null) {
            send(401, ['error' => 'Please log in first.']);
        }
        $body = read_json_body();
        $errors = [];
        $name = text($body['name'] ?? '');
        if (strlen($name) < 2) {
            $errors['name'] = 'Please enter your name.';
        }
        if (strlen($name) > MAX_FIELD) {
            $errors['name'] = 'Name is too long.';
        }
        if (strlen(text($body['phone'] ?? '')) > MAX_FIELD) {
            $errors['phone'] = 'Phone number is too long.';
        }
        if ($errors !== []) {
            send(422, ['error' => 'Validation failed', 'fields' => $errors]);
        }

        run_write($db, 'UPDATE users SET name = ?, phone = ? WHERE id = ?', [$name, nullable_text($body['phone'] ?? ''), (int) $user['id']]);
        $updated = fetch_one($db, 'SELECT id, email, name, phone, role, listing_id, status FROM users WHERE id = ?', [(int) $user['id']]);
        send(200, ['user' => public_user($updated)]);
    }

    return false;
}

function handle_favorites(mysqli $db, string $method, string $path): bool
{
    $user = current_user($db);
    if ($user === null) {
        send(401, ['error' => 'Please log in to save businesses.']);
    }
    $userId = (int) $user['id'];

    if ($method === 'GET' && $path === '/api/favorites') {
        send(200, ['ids' => favorite_ids($db, $userId)]);
    }

    if ($method === 'POST' && $path === '/api/favorites') {
        $body = read_json_body();
        $listing = listing_by_id($db, (int) ($body['listingId'] ?? 0));
        if ($listing === null) {
            send(404, ['error' => 'That business no longer exists.']);
        }
        // Idempotent: saving twice is not an error, it is the same saved state.
        run_write($db, 'INSERT IGNORE INTO favorites (user_id, listing_id) VALUES (?, ?)', [$userId, (int) $listing['id']]);
        send(200, ['ids' => favorite_ids($db, $userId)]);
    }

    if ($method === 'POST' && $path === '/api/favorites/merge') {
        $body = read_json_body();
        $ids = is_array($body['ids'] ?? null) ? $body['ids'] : [];
        foreach ($ids as $id) {
            $listing = listing_by_id($db, (int) $id);
            if ($listing !== null) {
                run_write($db, 'INSERT IGNORE INTO favorites (user_id, listing_id) VALUES (?, ?)', [$userId, (int) $listing['id']]);
            }
        }
        send(200, ['ids' => favorite_ids($db, $userId)]);
    }

    if ($method === 'DELETE' && preg_match('#^/api/favorites/(\d+)$#', $path, $m) === 1) {
        run_write($db, 'DELETE FROM favorites WHERE user_id = ? AND listing_id = ?', [$userId, (int) $m[1]]);
        send(200, ['ids' => favorite_ids($db, $userId)]);
    }

    return false;
}

function handle_vendor(mysqli $db, string $method, string $path): bool
{
    $user = current_user($db);
    if ($user === null) {
        send(401, ['error' => 'Please log in first.']);
    }
    $userId = (int) $user['id'];

    if ($method === 'POST' && $path === '/api/listings') {
        $body = read_json_body();
        $errors = [];
        $name = text($body['name'] ?? '');
        if (strlen($name) < 2) {
            $errors['name'] = 'Please enter the business name.';
        }
        if (strlen($name) > 200) {
            $errors['name'] = 'Business name is too long.';
        }

        $category = category_by_slug($db, text($body['categorySlug'] ?? ''));
        if ($category === null) {
            $errors['categorySlug'] = 'Pick the category that fits best.';
        }

        $city = (int) ($body['cityId'] ?? 0) > 0 ? city_by_id($db, (int) $body['cityId']) : null;
        $cityText = text($body['cityText'] ?? '');
        if ((int) ($body['cityId'] ?? 0) > 0 && $city === null) {
            $errors['city'] = 'Pick a city from the list.';
        } elseif ($city === null && strlen($cityText) < 2) {
            $errors['city'] = 'Which city do you serve?';
        }

        $website = safe_url($body['website'] ?? '');
        if (text($body['website'] ?? '') !== '' && $website === null) {
            $errors['website'] = 'Enter a full web address, like https://example.com.';
        }

        $email = text($body['email'] ?? '');
        if ($email !== '' && !preg_match(EMAIL_PATTERN, $email)) {
            $errors['email'] = 'Enter a valid email address.';
        }

        $priceFrom = to_price($body['priceFrom'] ?? null);
        if ($priceFrom === false) {
            $errors['priceFrom'] = 'Enter a price in dollars, or leave it blank.';
        }

        $description = text($body['description'] ?? '');
        if (strlen($description) > 5000) {
            $errors['description'] = 'Description is too long. Try a shorter summary.';
        }

        $country = $city !== null ? ['id' => (int) $city['country_id']] : country_by_code($db, 'US');
        if ($country === null) {
            $errors['country'] = 'The directory is not accepting submissions right now.';
        }
        if ($errors !== []) {
            send(422, ['error' => 'Validation failed', 'fields' => $errors]);
        }

        // No second row for a business already in the directory, whatever state it is in.
        $clash = fetch_one($db, 'SELECT id, name, slug, status FROM listings WHERE name = ?', [$name]);
        if ($clash === null) {
            // MySQL's default collation is case-insensitive, but do not rely on it.
            $clash = fetch_one($db, 'SELECT id, name, slug, status FROM listings WHERE LOWER(name) = LOWER(?)', [$name]);
        }
        if ($clash !== null) {
            send(409, [
                'error' => $clash['name'] . ' is already in the directory. Email us to claim or correct that listing instead.',
                'fields' => ['name' => 'This business is already listed.'],
            ]);
        }

        $slug = unique_listing_slug($db, $name);
        run_write(
            $db,
            "INSERT INTO listings
               (name, slug, category_id, country_id, state_id, city_id, city_text, description,
                website, phone, email, price_from, status, submitted_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
            [
                $name,
                $slug,
                (int) $category['id'],
                (int) $country['id'],
                $city === null ? null : (int) $city['state_id'],
                $city === null ? null : (int) $city['id'],
                $city === null ? nullable_text($cityText) : null,
                nullable_text($description),
                nullable_text($website),
                nullable_text($body['phone'] ?? ''),
                nullable_text($email),
                $priceFrom === null ? null : $priceFrom,
                $userId,
            ]
        );
        $listingId = (int) $db->insert_id;
        add_listing_category($db, $listingId, (int) $category['id']);
        run_write($db, 'UPDATE users SET listing_id = ? WHERE id = ?', [$listingId, $userId]);

        send(201, ['listing' => ['id' => $listingId, 'name' => $name, 'status' => 'pending']]);
    }

    if ($method === 'GET' && $path === '/api/vendor/listings') {
        $rows = select_listings($db, 'l.submitted_by = ?', [$userId], 'l.created_at DESC');
        send(200, ['items' => $rows]);
    }

    if ($method === 'GET' && $path === '/api/vendor/leads') {
        if ($user['listing_id'] === null) {
            send(200, ['items' => []]);
        }
        $rows = fetch_all(
            $db,
            'SELECT * FROM quote_requests WHERE vendor_id = ? ORDER BY created_at DESC, id DESC',
            [(int) $user['listing_id']]
        );
        send(200, ['items' => $rows]);
    }

    if ($method === 'PATCH' && preg_match('#^/api/vendor/listings/(\d+)$#', $path, $m) === 1) {
        $listing = listing_by_id($db, (int) $m[1]);
        if ($listing === null || (int) $listing['submitted_by'] !== $userId) {
            send(404, ['error' => 'That business is not yours to edit.']);
        }
        $body = read_json_body();

        $errors = [];
        $name = text($body['name'] ?? '');
        if (strlen($name) < 2) {
            $errors['name'] = 'Please enter the business name.';
        }
        $website = safe_url($body['website'] ?? '');
        if (text($body['website'] ?? '') !== '' && $website === null) {
            $errors['website'] = 'Enter a full web address, like https://example.com.';
        }
        $email = text($body['email'] ?? '');
        if ($email !== '' && !preg_match(EMAIL_PATTERN, $email)) {
            $errors['email'] = 'Enter a valid email address.';
        }
        $priceFrom = to_price($body['priceFrom'] ?? null);
        if ($priceFrom === false) {
            $errors['priceFrom'] = 'Enter a price in dollars, or leave it blank.';
        }
        if ($errors !== []) {
            send(422, ['error' => 'Validation failed', 'fields' => $errors]);
        }

        // A new city is only applied when one was sent; otherwise the listing
        // keeps the city it already had (id or free text).
        $city = (int) ($body['cityId'] ?? 0) > 0 ? city_by_id($db, (int) $body['cityId']) : null;
        $cityText = text($body['cityText'] ?? '');
        $newCityId = $city !== null ? (int) $city['id'] : (int) $listing['city_id'];
        $newCityText = $city !== null ? null : ($cityText !== '' ? $cityText : $listing['city_text']);

        $listingId = (int) $listing['id'];
        run_write(
            $db,
            'UPDATE listings SET name = ?, description = ?, website = ?, phone = ?, email = ?, price_from = ?, city_id = ?, city_text = ? WHERE id = ?',
            [
                $name,
                nullable_text($body['description'] ?? ''),
                nullable_text($website),
                nullable_text($body['phone'] ?? ''),
                nullable_text($email),
                $priceFrom === null ? null : $priceFrom,
                $newCityId > 0 ? $newCityId : null,
                nullable_text($newCityText),
                $listingId,
            ]
        );
        // Editing a rejected listing puts it back in the queue.
        $status = $listing['status'];
        if ($status === 'rejected') {
            run_write($db,   'UPDATE listings SET status = ?, review_note = NULL WHERE id = ?', ['pending', $listingId]);
            $status = 'pending';
        }
        send(200, ['listing' => ['id' => $listingId, 'name' => $name, 'status' => $status]]);
    }

    return false;
}

function handle_admin(mysqli $db, string $method, string $path): bool
{
    $user = current_user($db);
    if ($user === null) {
        send(401, ['error' => 'Please log in first.']);
    }
    if ($user['role'] !== 'admin') {
        send(403, ['error' => 'Admins only.']);
    }

    if ($method === 'GET' && $path === '/api/admin/stats') {
        $one = static function (string $sql) use ($db): int {
            return (int) (fetch_value($db, $sql) ?? 0);
        };
        $stats = [
            'listings' => $one("SELECT COUNT(*) FROM listings WHERE status = 'active'"),
            'pending' => $one("SELECT COUNT(*) FROM listings WHERE status = 'pending'"),
            'rejected' => $one("SELECT COUNT(*) FROM listings WHERE status = 'rejected'"),
            'cities' => $one('SELECT COUNT(*) FROM cities'),
            'categories' => $one('SELECT COUNT(*) FROM categories WHERE is_active = 1'),
            'users' => $one("SELECT COUNT(*) FROM users WHERE status = 'active'"),
            'vendors' => $one("SELECT COUNT(*) FROM users WHERE role = 'vendor'"),
            'quoteRequests' => $one('SELECT COUNT(*) FROM quote_requests'),
            'quotesLast7Days' => $one('SELECT COUNT(*) FROM quote_requests WHERE created_at >= (NOW() - INTERVAL 7 DAY)'),
            'favorites' => $one('SELECT COUNT(*) FROM favorites'),
        ];
        $byStatus = fetch_all($db, 'SELECT status, COUNT(*) AS total FROM listings GROUP BY status ORDER BY status');
        send(200, ['stats' => $stats, 'byStatus' => array_map(static function (array $row): array {
            $row['total'] = (int) $row['total'];
            return $row;
        }, $byStatus)]);
    }

    if ($method === 'GET' && $path === '/api/admin/submissions') {
        $status = text($_GET['status'] ?? '') !== '' ? text($_GET['status']) : 'pending';
        // Pending first, then oldest first, so the review queue is a real queue.
        send(200, ['items' => select_listings($db, 'l.status = ?', [$status], 'l.created_at, l.id')]);
    }

    if ($method === 'GET' && $path === '/api/admin/quotes') {
        $rows = fetch_all(
            $db,
            'SELECT q.*, l.name AS vendor_name
               FROM quote_requests q
               LEFT JOIN listings l ON l.id = q.vendor_id
              ORDER BY q.created_at DESC, q.id DESC
              LIMIT 50'
        );
        send(200, ['items' => $rows]);
    }

    if ($method === 'POST' && preg_match('#^/api/admin/listings/(\d+)/status$#', $path, $m) === 1) {
        $listing = listing_by_id($db, (int) $m[1]);
        if ($listing === null) {
            send(404, ['error' => 'Not found']);
        }
        $body = read_json_body();
        $status = text($body['status'] ?? '');
        if (!in_array($status, ['active', 'rejected', 'pending'], true)) {
            send(422, ['error' => 'Status must be active, rejected or pending.']);
        }
        $listingId = (int) $listing['id'];
        run_write($db, 'UPDATE listings SET status = ?, review_note = ? WHERE id = ?', [$status, nullable_text($body['note'] ?? ''), $listingId]);
        send(200, ['listing' => ['id' => $listingId, 'name' => $listing['name'], 'status' => $status]]);
    }

    return false;
}

/* ------------------------------------------------------------------------- */
/* Entry point                                                                */
/* ------------------------------------------------------------------------- */

// Include-only mode: the helpers above are available, nothing is routed.
if (defined('PARTYSPARK_LIB_ONLY')) {
    return;
}

try {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $path = rtrim($path, '/') ?: '/';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    // --- accounts -------------------------------------------------------
    if (strncmp($path, '/api/auth/', 10) === 0 && handle_auth($db, $method, $path) !== false) {
        exit;
    }

    if (strncmp($path, '/api/favorites', 14) === 0 && handle_favorites($db, $method, $path) !== false) {
        exit;
    }

    // Business submission lives on POST /api/listings but shares the vendor rules.
    if ((strncmp($path, '/api/vendor/', 12) === 0 || ($method === 'POST' && $path === '/api/listings'))
        && handle_vendor($db, $method, $path) !== false) {
        exit;
    }

    if (strncmp($path, '/api/admin/', 11) === 0 && handle_admin($db, $method, $path) !== false) {
        exit;
    }

    // --- quote requests -------------------------------------------------
    if ($method === 'POST' && $path === '/api/quote-requests') {
        if (!throttle('quote', 30, 15 * 60)) {
            send(429, ['error' => 'Too many requests. Please try again later.']);
        }
        $body = read_json_body();
        $errors = [];
        $name = text($body['name'] ?? '');
        $email = text($body['email'] ?? '');

        if (strlen($name) < 2) {
            $errors['name'] = 'Please enter your name.';
        }
        if (strlen($name) > MAX_FIELD) {
            $errors['name'] = 'Name is too long.';
        }
        if ($email === '') {
            $errors['email'] = 'Please enter your email.';
        } elseif (!preg_match(EMAIL_PATTERN, $email)) {
            $errors['email'] = 'Enter a valid email address.';
        } elseif (strlen($email) > MAX_FIELD) {
            $errors['email'] = 'Email is too long.';
        }
        foreach (['phone', 'city', 'eventDate', 'guestCount', 'childAge', 'categorySlug', 'budget'] as $field) {
            if (strlen(text($body[$field] ?? '')) > MAX_FIELD) {
                $errors[$field] = 'Value is too long.';
            }
        }
        if (strlen(text($body['details'] ?? '')) > 10000) {
            $errors['details'] = 'Message is too long.';
        }
        if ($errors !== []) {
            send(422, ['error' => 'Validation failed', 'fields' => $errors]);
        }

        $vendorId = null;
        if (text($body['vendorSlug'] ?? '') !== '') {
            $vendor = listing_by_slug($db, text($body['vendorSlug']));
            $vendorId = $vendor === null ? null : (int) $vendor['id'];
        }

        $user = current_user($db);
        run_write(
            $db,
            'INSERT INTO quote_requests
               (name, email, phone, city, event_date, guest_count, child_age, category_slug, budget, details, vendor_id, user_id, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $name,
                $email,
                nullable_text($body['phone'] ?? ''),
                nullable_text($body['city'] ?? ''),
                nullable_text($body['eventDate'] ?? ''),
                nullable_text($body['guestCount'] ?? ''),
                nullable_text($body['childAge'] ?? ''),
                nullable_text($body['categorySlug'] ?? ''),
                nullable_text($body['budget'] ?? ''),
                nullable_text($body['details'] ?? ''),
                $vendorId,
                $user === null ? null : (int) $user['id'],
                nullable_text($body['source'] ?? '') ?? 'web',
            ]
        );
        send(201, ['id' => (int) $db->insert_id, 'received' => true]);
    }

    if ($method === 'GET' && $path === '/api/quote-requests/mine') {
        $user = current_user($db);
        if ($user === null) {
            send(401, ['error' => 'Please log in first.']);
        }
        // Matches user_id and the account's email, so requests sent before
        // signing up are not lost.
        $rows = fetch_all(
            $db,
            'SELECT q.*, l.name AS vendor_name, l.slug AS vendor_slug
               FROM quote_requests q
               LEFT JOIN listings l ON l.id = q.vendor_id
              WHERE q.user_id = ? OR LOWER(q.email) = LOWER(?)
              ORDER BY q.created_at DESC, q.id DESC',
            [(int) $user['id'], (string) $user['email']]
        );
        send(200, ['items' => $rows]);
    }

    // --- directory ------------------------------------------------------
    if ($method === 'GET' && $path === '/api/categories') {
        $subs = [];
        foreach (fetch_all(
            $db,
            'SELECT c.slug AS category_slug, sc.name
               FROM subcategories sc
               JOIN categories c ON c.id = sc.category_id
              WHERE c.is_active = 1
              ORDER BY c.sort_order, sc.sort_order'
        ) as $row) {
            $subs[$row['category_slug']][] = $row['name'];
        }
        $out = [];
        foreach (fetch_all(
            $db,
            "SELECT c.id, c.slug, c.name, c.tagline, c.icon,
                    (SELECT COUNT(DISTINCT lc.listing_id)
                       FROM listing_categories lc
                       JOIN listings l ON l.id = lc.listing_id
                      WHERE lc.category_id = c.id AND l.status = 'active') AS listing_count
               FROM categories c
              WHERE c.is_active = 1
              ORDER BY c.sort_order"
        ) as $row) {
            $row['id'] = (int) $row['id'];
            $row['listing_count'] = (int) $row['listing_count'];
            $row['subcategories'] = $subs[$row['slug']] ?? [];
            $out[] = $row;
        }
        send(200, $out);
    }

    /**
     * What the directory can honestly claim: counts, plus how many businesses
     * publish a price. The UI hides the price controls when that number is 0.
     */
    if ($method === 'GET' && $path === '/api/directory-summary') {
        $row = fetch_one(
            $db,
            "SELECT COUNT(*) AS listings,
                    SUM(ci.id IS NOT NULL OR l.city_text IS NOT NULL) AS cities,
                    SUM(l.price_from IS NOT NULL) AS priced_listings,
                    MIN(l.price_from) AS min_price,
                    MAX(l.price_from) AS max_price
               FROM listings l
               LEFT JOIN cities ci ON ci.id = l.city_id
              WHERE l.status = 'active'"
        );
        send(200, [
            'listings' => (int) ($row['listings'] ?? 0),
            'cities' => (int) ($row['cities'] ?? 0),
            'categories' => (int) (fetch_value($db, 'SELECT COUNT(*) FROM categories WHERE is_active = 1') ?? 0),
            'pricedListings' => (int) ($row['priced_listings'] ?? 0),
            'minPrice' => $row['min_price'] === null ? null : (float) $row['min_price'],
            'maxPrice' => $row['max_price'] === null ? null : (float) $row['max_price'],
        ]);
    }

    if ($method === 'GET' && $path === '/api/cities') {
        $term = text($_GET['q'] ?? '');
        if ($term !== '') {
            $rows = fetch_all(
                $db,
                'SELECT ci.id, ci.name, s.code AS state_code, COUNT(l.id) AS listing_count
                   FROM cities ci
                   JOIN states s ON s.id = ci.state_id
                   LEFT JOIN listings l ON l.city_id = ci.id AND l.status = \'active\'
                  WHERE ci.name LIKE ?
                  GROUP BY ci.id, ci.name, s.code
                  ORDER BY listing_count DESC, ci.name
                  LIMIT 8',
                ['%' . $term . '%']
            );
        } else {
            $limit = (int) ($_GET['limit'] ?? 12);
            $limit = max(1, min(50, $limit));
            $rows = fetch_all(
                $db,
                'SELECT ci.id, ci.name, s.code AS state_code, COUNT(*) AS listing_count
                   FROM listings l
                   JOIN cities ci ON ci.id = l.city_id
                   JOIN states s  ON s.id  = ci.state_id
                  WHERE l.status = \'active\'
                  GROUP BY ci.id, ci.name, s.code
                  ORDER BY listing_count DESC, ci.name
                  LIMIT ?',
                [$limit]
            );
        }
        send(200, array_map(static function (array $row): array {
            $row['id'] = (int) $row['id'];
            $row['listing_count'] = (int) $row['listing_count'];
            return $row;
        }, $rows));
    }

    if ($method === 'GET' && $path === '/api/listings') {
        $slugMap = ['fairies' => 'fairy', 'non-mascot-characters' => 'non-mascots'];
        $category = text($_GET['category'] ?? '');
        $categoryIds = [];
        if ($category !== '') {
            foreach (preg_split('/[,\s]+/', $category) as $slug) {
                $slug = trim((string) $slug);
                if ($slug === '') {
                    continue;
                }
                $cat = category_by_slug($db, $slugMap[$slug] ?? $slug);
                if ($cat !== null) {
                    $categoryIds[] = (int) $cat['id'];
                }
            }
        }
        $city = text($_GET['city'] ?? '');
        if ($city === '') {
            $city = text($_GET['location'] ?? '');
        }

        $filters = [];
        $qText = text($_GET['q'] ?? '');
        if ($qText !== '') {
            $filters['q'] = $qText;
        }
        if ($categoryIds) {
            $filters['categoryIds'] = $categoryIds;
        } elseif ($category !== '') {
            $filters['categoryId'] = 0;
        }
        $city = trim(preg_replace('/,\s*[A-Z]{2}$/i', '', $city) ?? '');
        if ($city !== '') {
            $filters['city'] = $city;
        }
        foreach (['priceMin', 'priceMax', 'ratingMin'] as $key) {
            if (isset($_GET[$key]) && is_numeric($_GET[$key])) {
                $filters[$key] = (float) $_GET[$key];
            }
        }
        if (($_GET['featured'] ?? '') === '1') {
            $filters['featuredOnly'] = true;
        }

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $pageSize = (int) ($_GET['pageSize'] ?? 24);
        $pageSize = max(1, min(48, $pageSize));

        $built = build_filters($filters);
        $total = (int) (fetch_value(
            $db,
            "SELECT COUNT(*) FROM listings l
               LEFT JOIN cities ci ON ci.id = l.city_id
               LEFT JOIN states s  ON s.id  = l.state_id
              WHERE {$built['clause']}",
            $built['params']
        ) ?? 0);

        $items = select_listings(
            $db,
            $built['clause'],
            $built['params'],
            order_clause(text($_GET['sort'] ?? '') !== '' ? text($_GET['sort']) : null),
            $pageSize,
            ($page - 1) * $pageSize
        );

        send(200, ['total' => $total, 'page' => $page, 'pageSize' => $pageSize, 'items' => $items]);
    }

    // Must come before the slug route: "by-ids" would otherwise look like a slug.
    if ($method === 'GET' && $path === '/api/listings/by-ids') {
        $ids = [];
        foreach (explode(',', text($_GET['ids'] ?? '')) as $value) {
            if (is_numeric(trim($value)) && (int) $value > 0) {
                $ids[] = (int) $value;
            }
        }
        $clean = array_slice(array_unique($ids), 0, 100);
        if ($clean === []) {
            send(200, ['items' => []]);
        }
        $placeholders = implode(', ', array_fill(0, count($clean), '?'));
        send(200, ['items' => select_listings($db, "l.status = 'active' AND l.id IN ($placeholders)", $clean)]);
    }

    if ($method === 'GET' && preg_match('#^/api/listings/([^/]+)$#', $path, $m) === 1) {
        $item = listing_by_slug($db, rawurldecode($m[1]));
        if ($item === null) {
            send(404, ['error' => 'Not found']);
        }
        $item['categories'] = listing_categories($db, (int) $item['id']);
        send(200, $item);
    }

    send(404, ['error' => 'Not found']);
} catch (Throwable $e) {
    error_log($e->getMessage());
    send(500, ['error' => 'Server error']);
}
