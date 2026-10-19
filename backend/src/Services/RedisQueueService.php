<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Config;
use Throwable;

/**
 * Enterprise-grade Redis Queue Service for asynchronous background push notifications.
 *
 * Supports both:
 * 1. Native PHP `\Redis` PECL extension if installed.
 * 2. High-performance native PHP stream socket implementation via standard Redis Serialization Protocol (RESP),
 *    enabling zero-dependency connection to any local or remote Redis server without requiring external C extensions.
 *
 * Provides safe failover: if Redis is offline or disabled, callers can fall back to synchronous dispatch without errors.
 */
class RedisQueueService
{
    private bool $enabled;
    private string $host;
    private int $port;
    private ?string $password;
    private string $defaultQueue;
    private float $timeout;

    /** @var \Redis|resource|null */
    private mixed $connection = null;
    private bool $connectionAttempted = false;
    private bool $isSocket = false;

    public function __construct(
        ?bool $enabled = null,
        ?string $host = null,
        ?int $port = null,
        ?string $password = null,
        ?string $defaultQueue = null,
        ?float $timeout = null,
    ) {
        $this->enabled = $enabled ?? (bool) Config::get('redis.enabled', false);
        $this->host = $host ?? (string) Config::get('redis.host', '127.0.0.1');
        $this->port = $port ?? (int) Config::get('redis.port', 6379);
        $this->password = $password ?? Config::get('redis.password');
        $this->defaultQueue = $defaultQueue ?? (string) Config::get('redis.queue_name', 'adams:push_queue');
        $this->timeout = $timeout ?? (float) Config::get('redis.timeout', 1.5);
    }

    public function isConfigured(): bool
    {
        return $this->enabled && !empty($this->host) && $this->port > 0;
    }

    public function isAvailable(): bool
    {
        if (!$this->isConfigured()) {
            return false;
        }

        return $this->connect() !== null;
    }

    /**
     * Enqueue a push notification job onto the Redis queue.
     *
     * @param array<string, mixed> $payload
     */
    public function push(array $payload, ?string $queue = null): bool
    {
        $queueName = $queue ?? $this->defaultQueue;
        $encoded = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($encoded === false) {
            return false;
        }

        try {
            $conn = $this->connect();
            if ($conn === null) {
                return false;
            }

            if (!$this->isSocket && $conn instanceof \Redis) {
                return (bool) $conn->rPush($queueName, $encoded);
            }

            if ($this->isSocket && is_resource($conn)) {
                $response = $this->sendSocketCommand($conn, ['RPUSH', $queueName, $encoded]);
                return is_int($response) && $response > 0;
            }

            return false;
        } catch (Throwable $e) {
            error_log('[RedisQueueService] push failed: ' . $e->getMessage());
            $this->close();
            return false;
        }
    }

    /**
     * Pop a job from the Redis queue (blocking or non-blocking).
     *
     * @return array<string, mixed>|null
     */
    public function pop(?string $queue = null, int $timeoutSeconds = 0): ?array
    {
        $queueName = $queue ?? $this->defaultQueue;

        try {
            $conn = $this->connect();
            if ($conn === null) {
                return null;
            }

            if (!$this->isSocket && $conn instanceof \Redis) {
                if ($timeoutSeconds > 0) {
                    $result = $conn->bLPop([$queueName], $timeoutSeconds);
                    if (is_array($result) && isset($result[1])) {
                        return json_decode($result[1], true);
                    }
                } else {
                    $raw = $conn->lPop($queueName);
                    if (is_string($raw) && $raw !== '') {
                        return json_decode($raw, true);
                    }
                }
                return null;
            }

            if ($this->isSocket && is_resource($conn)) {
                if ($timeoutSeconds > 0) {
                    $cmd = ['BLPOP', $queueName, (string) $timeoutSeconds];
                } else {
                    $cmd = ['LPOP', $queueName];
                }

                $res = $this->sendSocketCommand($conn, $cmd);
                if (is_array($res) && isset($res[1])) {
                    return json_decode((string) $res[1], true);
                }
                if (is_string($res) && $res !== '') {
                    return json_decode($res, true);
                }
            }

            return null;
        } catch (Throwable $e) {
            error_log('[RedisQueueService] pop failed: ' . $e->getMessage());
            $this->close();
            return null;
        }
    }

    /**
     * Get number of pending jobs in the queue.
     */
    public function length(?string $queue = null): int
    {
        $queueName = $queue ?? $this->defaultQueue;

        try {
            $conn = $this->connect();
            if ($conn === null) {
                return 0;
            }

            if (!$this->isSocket && $conn instanceof \Redis) {
                return (int) $conn->lLen($queueName);
            }

            if ($this->isSocket && is_resource($conn)) {
                $res = $this->sendSocketCommand($conn, ['LLEN', $queueName]);
                return is_int($res) ? $res : 0;
            }

            return 0;
        } catch (Throwable $e) {
            error_log('[RedisQueueService] length failed: ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * Test ping to the Redis server.
     */
    public function ping(): bool
    {
        try {
            $conn = $this->connect();
            if ($conn === null) {
                return false;
            }

            if (!$this->isSocket && $conn instanceof \Redis) {
                $pong = $conn->ping();
                return $pong === true || $pong === '+PONG' || $pong === 'PONG';
            }

            if ($this->isSocket && is_resource($conn)) {
                $pong = $this->sendSocketCommand($conn, ['PING']);
                return $pong === 'PONG';
            }

            return false;
        } catch (Throwable $e) {
            return false;
        }
    }

    /**
     * Retrieve status summary for admin diagnostics.
     *
     * @return array{
     *   enabled: bool,
     *   connected: bool,
     *   host: string,
     *   port: int,
     *   queue_name: string,
     *   pending_jobs: int,
     *   driver: string
     * }
     */
    public function getStats(): array
    {
        $connected = $this->ping();
        $pending = $connected ? $this->length() : 0;
        $driver = class_exists(\Redis::class) ? 'phpredis_extension' : 'native_resp_socket';

        return [
            'enabled' => $this->enabled,
            'connected' => $connected,
            'host' => $this->host,
            'port' => $this->port,
            'queue_name' => $this->defaultQueue,
            'pending_jobs' => $pending,
            'driver' => $driver,
        ];
    }

    /**
     * Establish connection using phpredis or RESP socket.
     *
     * @return \Redis|resource|null
     */
    private function connect(): mixed
    {
        if ($this->connection !== null) {
            return $this->connection;
        }

        if ($this->connectionAttempted) {
            return null;
        }

        $this->connectionAttempted = true;

        if (!$this->enabled) {
            return null;
        }

        // Try PECL \Redis if available
        if (class_exists(\Redis::class)) {
            try {
                $redis = new \Redis();
                $connected = @$redis->connect($this->host, $this->port, $this->timeout);
                if ($connected) {
                    if (!empty($this->password)) {
                        $redis->auth($this->password);
                    }
                    $this->connection = $redis;
                    $this->isSocket = false;
                    return $redis;
                }
            } catch (Throwable $e) {
                error_log('[RedisQueueService] phpredis extension connect failed: ' . $e->getMessage());
            }
        }

        // Fall back to pure PHP RESP socket
        try {
            $remote = "tcp://{$this->host}:{$this->port}";
            $errno = 0;
            $errstr = '';
            $fp = @stream_socket_client($remote, $errno, $errstr, $this->timeout, STREAM_CLIENT_CONNECT);

            if (!is_resource($fp)) {
                return null;
            }

            stream_set_timeout($fp, (int) ceil($this->timeout));

            if (!empty($this->password)) {
                $authRes = $this->sendSocketCommand($fp, ['AUTH', $this->password]);
                if ($authRes !== 'OK') {
                    fclose($fp);
                    return null;
                }
            }

            $this->connection = $fp;
            $this->isSocket = true;
            return $fp;
        } catch (Throwable $e) {
            error_log('[RedisQueueService] socket connect failed: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Send command via Redis Serialization Protocol (RESP) over raw socket.
     */
    private function sendSocketCommand(mixed $fp, array $args): mixed
    {
        if (!is_resource($fp)) {
            return null;
        }

        // Build RESP array: *<count>\r\n$<len>\r\n<arg>\r\n...
        $cmd = '*' . count($args) . "\r\n";
        foreach ($args as $arg) {
            $argStr = (string) $arg;
            $cmd .= '$' . strlen($argStr) . "\r\n" . $argStr . "\r\n";
        }

        $written = @fwrite($fp, $cmd);
        if ($written === false) {
            return null;
        }

        return $this->parseSocketResponse($fp);
    }

    /**
     * Parse RESP response.
     */
    private function parseSocketResponse(mixed $fp): mixed
    {
        $line = fgets($fp);
        if ($line === false) {
            return null;
        }

        $type = $line[0];
        $payload = substr(rtrim($line, "\r\n"), 1);

        switch ($type) {
            case '+': // Simple string
                return $payload;
            case '-': // Error
                error_log('[RedisQueueService] Redis error response: ' . $payload);
                return null;
            case ':': // Integer
                return (int) $payload;
            case '$': // Bulk string
                $len = (int) $payload;
                if ($len === -1) {
                    return null;
                }
                $data = '';
                $read = 0;
                while ($read < $len) {
                    $chunk = fread($fp, min(4096, $len - $read));
                    if ($chunk === false || $chunk === '') {
                        break;
                    }
                    $data .= $chunk;
                    $read += strlen($chunk);
                }
                // discard trailing \r\n
                fread($fp, 2);
                return $data;
            case '*': // Array
                $count = (int) $payload;
                if ($count === -1) {
                    return null;
                }
                $items = [];
                for ($i = 0; $i < $count; $i++) {
                    $items[] = $this->parseSocketResponse($fp);
                }
                return $items;
            default:
                return null;
        }
    }

    public function close(): void
    {
        if ($this->connection !== null) {
            try {
                if ($this->isSocket && is_resource($this->connection)) {
                    fclose($this->connection);
                } elseif (!$this->isSocket && $this->connection instanceof \Redis) {
                    $this->connection->close();
                }
            } catch (Throwable $e) {}
            $this->connection = null;
        }
        $this->connectionAttempted = false;
    }

    public function __destruct()
    {
        $this->close();
    }
}
