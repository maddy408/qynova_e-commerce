<?php

declare(strict_types=1);

namespace App\Services;

use RuntimeException;

/**
 * Downloads an admin-supplied image URL (Excel import "Product Images" /
 * "Variant Images" columns) into a local temp file, guarding against SSRF:
 * only http/https, no redirects followed (a redirect to an internal host
 * would otherwise bypass the DNS check below), every resolved IP checked
 * against private/loopback/link-local/reserved ranges, a hard size cap
 * enforced while streaming (not just trusted from Content-Length), and the
 * downloaded bytes re-sniffed by MIME rather than trusting the URL's
 * extension or the server's Content-Type header.
 */
final class SafeImageFetcher
{
    private const MAX_BYTES = 5 * 1024 * 1024;
    private const TIMEOUT_SECONDS = 8;
    private const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

    /**
     * @return array{tmp_path: string, size: int}|null null when the URL is
     *         rejected or the download fails — caller treats this as "image
     *         could not be resolved" and must surface it as a row error,
     *         never silently drop it.
     */
    public function fetch(string $url): ?array
    {
        $url = trim($url);
        $parts = parse_url($url);

        if ($parts === false || !isset($parts['scheme'], $parts['host'])) {
            return null;
        }

        if (!in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
            return null;
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            return null; // no embedded credentials — not a legitimate public image URL
        }

        $host = $parts['host'];

        if (!$this->isPublicHost($host)) {
            return null;
        }

        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => self::TIMEOUT_SECONDS,
                'follow_location' => 0, // never follow redirects (SSRF via redirect)
                'max_redirects' => 0,
                'header' => "User-Agent: AdamsEcommerceImporter/1.0\r\n",
                'ignore_errors' => false,
            ],
            'https' => [
                'timeout' => self::TIMEOUT_SECONDS,
                'follow_location' => 0,
                'max_redirects' => 0,
            ],
        ]);

        $tmpPath = tempnam(sys_get_temp_dir(), 'img_');
        if ($tmpPath === false) {
            return null;
        }

        $stream = @fopen($url, 'rb', false, $context);
        if ($stream === false) {
            @unlink($tmpPath);
            return null;
        }

        $out = @fopen($tmpPath, 'wb');
        if ($out === false) {
            fclose($stream);
            @unlink($tmpPath);
            return null;
        }

        $total = 0;
        while (!feof($stream)) {
            $chunk = fread($stream, 65536);
            if ($chunk === false) {
                break;
            }
            $total += strlen($chunk);
            if ($total > self::MAX_BYTES) {
                fclose($stream);
                fclose($out);
                @unlink($tmpPath);
                return null;
            }
            fwrite($out, $chunk);
        }
        fclose($stream);
        fclose($out);

        if ($total === 0) {
            @unlink($tmpPath);
            return null;
        }

        $mime = mime_content_type($tmpPath);
        if ($mime === false || !in_array($mime, self::ALLOWED_MIME, true)) {
            @unlink($tmpPath);
            return null;
        }

        return ['tmp_path' => $tmpPath, 'size' => $total];
    }

    /**
     * Resolves the host and rejects anything that is not a public,
     * routable address — blocks loopback, link-local, private (RFC1918 /
     * ULA), and other reserved ranges so an import can't be used to make
     * the server fetch its own internal network.
     */
    private function isPublicHost(string $host): bool
    {
        $ips = [];

        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            $ips[] = $host;
        } else {
            $records = @dns_get_record($host, DNS_A + DNS_AAAA);
            if ($records === false || $records === []) {
                $resolved = gethostbyname($host);
                if ($resolved === $host) {
                    return false; // DNS resolution failed
                }
                $ips[] = $resolved;
            } else {
                foreach ($records as $record) {
                    if (isset($record['ip'])) {
                        $ips[] = $record['ip'];
                    } elseif (isset($record['ipv6'])) {
                        $ips[] = $record['ipv6'];
                    }
                }
            }
        }

        if ($ips === []) {
            return false;
        }

        foreach ($ips as $ip) {
            $isPublic = filter_var(
                $ip,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            );

            if ($isPublic === false) {
                return false; // any resolved address being non-public rejects the whole host
            }
        }

        return true;
    }
}
