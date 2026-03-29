<?php
declare(strict_types=1);

final class SessionStore
{
    private string $dataDir;

    public function __construct(string $dataDir)
    {
        $this->dataDir = rtrim($dataDir, DIRECTORY_SEPARATOR);
        if (!is_dir($this->dataDir)) {
            mkdir($this->dataDir, 0775, true);
        }
    }

    public function load(string $sessionCode): array
    {
        $path = $this->pathFor($sessionCode);
        if (!file_exists($path)) {
            return $this->newSession($sessionCode);
        }

        $raw = file_get_contents($path);
        if ($raw === false) {
            return $this->newSession($sessionCode);
        }

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            return $this->newSession($sessionCode);
        }

        return $data;
    }

    public function saveSettings(string $sessionCode, array $settings): array
    {
        $session = $this->load($sessionCode);
        $session['settings'] = $settings;
        $session['updatedAt'] = time();
        $this->save($sessionCode, $session);
        return $session;
    }

    public function appendEvent(string $sessionCode, array $event): array
    {
        $session = $this->load($sessionCode);
        $session['events'][] = $event;
        $session['updatedAt'] = time();

        $this->recomputeAggregates($session);
        $this->save($sessionCode, $session);
        return $session;
    }

    private function save(string $sessionCode, array $session): void
    {
        $path = $this->pathFor($sessionCode);
        $tmp = $path . '.tmp';
        file_put_contents($tmp, json_encode($session, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        rename($tmp, $path);
    }

    private function pathFor(string $sessionCode): string
    {
        $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '', $sessionCode) ?? 'default';
        if ($safe === '') {
            $safe = 'default';
        }
        return $this->dataDir . DIRECTORY_SEPARATOR . $safe . '.json';
    }

    private function newSession(string $sessionCode): array
    {
        return [
            'sessionCode' => $sessionCode,
            'settings' => [],
            'events' => [],
            'aggregates' => [
                'attempts' => 0,
                'success' => 0,
                'fail' => 0,
                'uncertain' => 0,
                'precision_estimate' => 0.0,
            ],
            'createdAt' => time(),
            'updatedAt' => time(),
        ];
    }

    private function recomputeAggregates(array &$session): void
    {
        $attempts = 0;
        $success = 0;
        $fail = 0;
        $uncertain = 0;

        foreach ($session['events'] as $event) {
            if (($event['type'] ?? '') !== 'nanny_decision') {
                continue;
            }
            $attempts++;
            $decision = $event['payload']['decision'] ?? 'NO_DECISION';
            if ($decision === 'SUCCESS') {
                $success++;
            } elseif ($decision === 'FAIL') {
                $fail++;
            } else {
                $uncertain++;
            }
        }

        $precision = $attempts > 0 ? round($success / $attempts, 4) : 0.0;

        $session['aggregates'] = [
            'attempts' => $attempts,
            'success' => $success,
            'fail' => $fail,
            'uncertain' => $uncertain,
            'precision_estimate' => $precision,
        ];
    }
}
