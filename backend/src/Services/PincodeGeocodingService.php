<?php

declare(strict_types=1);

namespace App\Services;

use PDO;

/**
 * Resolves a 6-digit pincode to district/area/lat/lng for Delivery
 * Management, consulting the local tn_pincodes cache first:
 *
 *  1. Cache hit with lat/lng already known -> return it.
 *  2. Cache miss -> call the India Post API live (api.postalpincode.in),
 *     filtering to the Tamil Nadu post office (the same numeric range
 *     also covers Puducherry/Karaikal, so State is checked explicitly),
 *     and cache the row (geocode_source='pending', no lat/lng yet).
 *  3. Cache hit/miss-now-cached but lat/lng still null -> lazily
 *     forward-geocode via Nominatim ("{pincode}, {district}, Tamil
 *     Nadu, India"), rate-limited to ~1 req/sec via a DB-backed
 *     timestamp (app_settings) so the limit holds across separate PHP
 *     requests, not just within one process. Nominatim failing/
 *     returning nothing falls back to the district's centroid
 *     (geocode_source='district_centroid' — the API/UI can then say the
 *     distance is approximate).
 *
 * A pincode outside Tamil Nadu (or not found at all) is not an error —
 * resolve() returns is_tamil_nadu=false, which the delivery-check
 * endpoint turns into a clear "beyond radius, post office" message
 * rather than failing the request.
 */
final class PincodeGeocodingService
{
    private const NOMINATIM_MIN_INTERVAL_SECONDS = 1.0;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @return array{pincode: string, is_tamil_nadu: bool, district: ?string, area: ?string, lat: ?float, lng: ?float, geocode_source: string}|null
     *   null only when $pincode isn't even 6 digits.
     */
    public function resolve(string $pincode): ?array
    {
        $pincode = trim($pincode);
        if (!preg_match('/^\d{6}$/', $pincode)) {
            return null;
        }

        $row = $this->fetchCached($pincode);

        if ($row === null) {
            $row = $this->cacheFromIndiaPost($pincode);
        }

        if ($row === null) {
            return [
                'pincode' => $pincode,
                'found' => false,
                'is_tamil_nadu' => false,
                'state' => null,
                'district' => null,
                'area' => null,
                'lat' => null,
                'lng' => null,
                'geocode_source' => 'pending',
            ];
        }

        $isTamilNadu = (($row['state'] ?? '') === 'Tamil Nadu');

        if ($isTamilNadu && ($row['lat'] === null || $row['lng'] === null) && !empty($row['district'])) {
            $this->geocode($pincode, (string) $row['district']);
            $row = $this->fetchCached($pincode) ?? $row;
        }

        return [
            'pincode' => $pincode,
            'found' => true,
            'is_tamil_nadu' => $isTamilNadu,
            'state' => $row['state'] ?? null,
            'district' => $row['district'] ?? null,
            'area' => $row['office_name'] ?? null,
            'lat' => $row['lat'] !== null ? (float) $row['lat'] : null,
            'lng' => $row['lng'] !== null ? (float) $row['lng'] : null,
            'geocode_source' => $row['geocode_source'],
        ];
    }

    /** @return array<string, mixed>|null */
    private function fetchCached(string $pincode): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM tn_pincodes WHERE pincode = :p');
        $stmt->execute(['p' => $pincode]);
        $row = $stmt->fetch();

        return $row !== false ? $row : null;
    }

    /**
     * India-Post-only cache fill — looks up the pincode live and caches
     * district/office/state, WITHOUT ever calling Nominatim. Public so
     * scripts/seed_tn_pincodes.php can bulk-populate district data for
     * the whole TN pincode range without geocoding all of it eagerly
     * (that stays lazy — see resolve() / geocode()).
     *
     * @return array<string, mixed>|null null when not found, or found
     *   but not in Tamil Nadu (this same numeric range also covers
     *   Puducherry/Karaikal, filtered out by checking State explicitly).
     */
    public function cacheFromIndiaPost(string $pincode): ?array
    {
        [, $cached] = $this->fetchAndCacheFromIndiaPost($pincode);

        return $cached;
    }

    /**
     * Same India-Post lookup as cacheFromIndiaPost(), but also reports
     * WHY a pincode wasn't cached — scripts/seed_tn_pincodes.php needs
     * this to tell "the API call itself failed/timed out" (worth a
     * retry-with-backoff) apart from "the API answered fine, this
     * pincode legitimately isn't Tamil Nadu" (not worth retrying). One
     * HTTP call either way, shared with cacheFromIndiaPost() above via
     * fetchAndCacheFromIndiaPost().
     *
     * @return 'valid'|'skipped'|'failed'
     */
    public function cacheFromIndiaPostWithStatus(string $pincode): string
    {
        [$httpOk, $cached] = $this->fetchAndCacheFromIndiaPost($pincode);
        if (!$httpOk) {
            return 'failed';
        }

        return $cached !== null ? 'valid' : 'skipped';
    }

    /** @return array{0: bool, 1: array<string, mixed>|null} [http call succeeded, cached row or null] */
    private function fetchAndCacheFromIndiaPost(string $pincode): array
    {
        $json = $this->httpGetJson("https://api.postalpincode.in/pincode/{$pincode}");
        if ($json === null) {
            return [false, null];
        }

        $entry = $json[0] ?? null;
        if (!is_array($entry) || ($entry['Status'] ?? '') !== 'Success' || empty($entry['PostOffice']) || !is_array($entry['PostOffice'])) {
            return [true, null];
        }

        $office = null;
        foreach ($entry['PostOffice'] as $po) {
            if (is_array($po) && ($po['State'] ?? '') === 'Tamil Nadu') {
                $office = $po;
                break;
            }
        }

        if ($office === null && !empty($entry['PostOffice'][0]) && is_array($entry['PostOffice'][0])) {
            $office = $entry['PostOffice'][0];
        }

        if ($office === null) {
            return [true, null];
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO tn_pincodes (pincode, office_name, district, block, state, geocode_source, fetched_at)
             VALUES (:pincode, :office_name, :district, :block, :state, "pending", NOW())
             ON DUPLICATE KEY UPDATE office_name = VALUES(office_name), district = VALUES(district),
                 block = VALUES(block), state = VALUES(state), fetched_at = NOW()'
        );
        $stmt->execute([
            'pincode' => $pincode,
            'office_name' => $office['Name'] ?? null,
            'district' => $office['District'] ?? null,
            'block' => $office['Block'] ?? null,
            'state' => $office['State'] ?? null,
        ]);

        return [true, $this->fetchCached($pincode)];
    }

    private function geocode(string $pincode, string $district): void
    {
        $this->throttleNominatim();

        $query = urlencode("{$pincode}, {$district}, Tamil Nadu, India");
        $json = $this->httpGetJson(
            "https://nominatim.openstreetmap.org/search?q={$query}&format=json&limit=1",
            ['User-Agent: AdamsEcommerce-DeliveryCheck/1.0 (+https://shopadams.in)']
        );

        $lat = null;
        $lng = null;
        $source = 'district_centroid';

        if (!empty($json[0]['lat']) && !empty($json[0]['lon'])) {
            $lat = (float) $json[0]['lat'];
            $lng = (float) $json[0]['lon'];
            $source = 'nominatim';
        } else {
            $centroid = $this->districtCentroid($district);
            if ($centroid !== null) {
                $lat = $centroid['lat'];
                $lng = $centroid['lng'];
            }
        }

        if ($lat === null || $lng === null) {
            return;
        }

        $this->pdo->prepare(
            'UPDATE tn_pincodes SET lat = :lat, lng = :lng, geocode_source = :src, geocoded_at = NOW() WHERE pincode = :p'
        )->execute(['lat' => $lat, 'lng' => $lng, 'src' => $source, 'p' => $pincode]);
    }

    /** @return array{lat: float, lng: float}|null */
    private function districtCentroid(string $district): ?array
    {
        $stmt = $this->pdo->prepare('SELECT lat, lng FROM district_centroids WHERE district = :d');
        $stmt->execute(['d' => $district]);
        $row = $stmt->fetch();

        return $row !== false ? ['lat' => (float) $row['lat'], 'lng' => (float) $row['lng']] : null;
    }

    /**
     * ~1 req/sec across ALL requests hitting this service, not just
     * within one PHP process — a static property wouldn't survive
     * between separate web requests, so the last-call time is persisted
     * in app_settings (the same generic key-value table other small
     * settings already use) instead.
     */
    private function throttleNominatim(): void
    {
        $stmt = $this->pdo->query('SELECT setting_value FROM app_settings WHERE setting_key = "nominatim_last_call_at"');
        $last = $stmt->fetchColumn();

        if ($last !== false) {
            $elapsed = microtime(true) - (float) $last;
            if ($elapsed < self::NOMINATIM_MIN_INTERVAL_SECONDS) {
                usleep((int) ((self::NOMINATIM_MIN_INTERVAL_SECONDS - $elapsed) * 1_000_000));
            }
        }

        $this->pdo->prepare(
            'INSERT INTO app_settings (setting_key, setting_value) VALUES ("nominatim_last_call_at", :v)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()'
        )->execute(['v' => (string) microtime(true)]);
    }

    /** @return array<mixed>|null */
    private function httpGetJson(string $url, array $headers = []): ?array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER => array_merge(
                $headers !== [] ? $headers : ['User-Agent: AdamsEcommerce-DeliveryCheck/1.0'],
                ['Accept: application/json']
            ),
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($body === false || $status !== 200) {
            return null;
        }

        $json = json_decode((string) $body, true);

        return is_array($json) ? $json : null;
    }
}
