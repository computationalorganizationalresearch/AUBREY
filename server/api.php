<?php
declare(strict_types=1);

header('Content-Type: application/json');

require_once __DIR__ . '/lib/SessionStore.php';

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$raw = file_get_contents('php://input');
if ($raw === false || trim($raw) === '') {
    respond(400, ['ok' => false, 'error' => 'Empty body']);
}

$input = json_decode($raw, true);
if (!is_array($input)) {
    respond(400, ['ok' => false, 'error' => 'Invalid JSON']);
}

$type = $input['type'] ?? null;
$sessionCode = $input['sessionCode'] ?? 'default';
$payload = $input['payload'] ?? [];

if (!is_string($type) || trim($type) === '') {
    respond(422, ['ok' => false, 'error' => 'Missing type']);
}
if (!is_string($sessionCode) || trim($sessionCode) === '') {
    respond(422, ['ok' => false, 'error' => 'Missing sessionCode']);
}
if (!is_array($payload)) {
    respond(422, ['ok' => false, 'error' => 'Payload must be object']);
}

$store = new SessionStore(__DIR__ . '/data');

try {
    if ($type === 'save_settings') {
        $session = $store->saveSettings($sessionCode, $payload);
        respond(200, [
            'ok' => true,
            'sessionCode' => $sessionCode,
            'updatedAt' => $session['updatedAt'],
            'aggregates' => $session['aggregates'] ?? null,
        ]);
    }

    $event = [
        'id' => bin2hex(random_bytes(8)),
        'type' => $type,
        'payload' => $payload,
        'ts' => time(),
    ];

    $session = $store->appendEvent($sessionCode, $event);

    respond(200, [
        'ok' => true,
        'sessionCode' => $sessionCode,
        'eventId' => $event['id'],
        'updatedAt' => $session['updatedAt'],
        'aggregates' => $session['aggregates'],
    ]);
} catch (Throwable $e) {
    respond(500, [
        'ok' => false,
        'error' => 'Server error',
        'details' => $e->getMessage(),
    ]);
}
