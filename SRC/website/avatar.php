<?php
declare(strict_types=1);

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
if ($id === false || $id < 0) {
    http_response_code(404);
    exit;
}

$assetPath = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'data'
    . DIRECTORY_SEPARATOR . 'icon' . DIRECTORY_SEPARATOR . 'x1' . DIRECTORY_SEPARATOR . $id . '.png';
if (!is_file($assetPath)) {
    http_response_code(404);
    exit;
}

header('Content-Type: image/png');
header('Cache-Control: public, max-age=86400');
readfile($assetPath);
