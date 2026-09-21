<?php
/**
 * Template for the database credentials used by the PHP API.
 *
 * Copy this file to db-config.php (same folder) and fill in the real values.
 * On the host, db-config.php belongs OUTSIDE the web root: with public_html
 * mapped to deploy/public/, keep it at deploy/db-config.php.
 *
 * The PHP API answers {"error":"Server error"} (HTTP 500) when this file is
 * missing or the credentials do not work.
 */
return [
    'host' => 'localhost',
    'user' => 'your_database_user',
    'password' => 'your_database_password',
    'database' => 'your_database_name',
];
