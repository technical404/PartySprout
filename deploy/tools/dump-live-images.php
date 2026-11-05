<?php
/**
 * Prints every active listing's picture as JSON, so a run on a developer machine knows
 * what the live site really shows.
 *
 *   ssh <host> 'php tools/dump-live-images.php' > live-images.json
 *   node scripts/dedupe-listing-images.cjs --apply --sql-only --against live-images.json
 *
 * The database lives here, not on the machine that runs the dedupe script, and the two
 * drift: a listing can have a picture live while the local copy still shows it blank.
 * Being wrong about that would either overwrite a picture someone had chosen or pick one
 * the live site already shows somewhere else.
 *
 * Read-only. Prints JSON to stdout and nothing else, so it is safe to pipe into a file.
 */

declare(strict_types=1);

$config = require dirname(__DIR__) . '/db-config.php';

$pdo = new PDO(
    'mysql:host=' . $config['host'] . ';dbname=' . $config['database'] . ';charset=utf8mb4',
    $config['user'],
    $config['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);

$rows = $pdo
    ->query("SELECT slug, image_url FROM listings WHERE status = 'active' ORDER BY slug")
    ->fetchAll(PDO::FETCH_ASSOC);

echo json_encode($rows, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
