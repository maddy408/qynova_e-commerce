<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Services\SeoService;
use PDO;

/**
 * Public SEO endpoints used by the storefront's server entry (index.php):
 *   GET /api/seo/render?path=/product/xyz&query=page=2   -> head/body HTML for that URL
 *   GET /api/seo/robots.txt
 *   GET /api/seo/sitemap.xml  and  /api/seo/sitemap-{part}.xml
 *   GET /api/seo/google-merchant.xml
 */
final class SeoController
{
    private readonly SeoService $seo;

    public function __construct(PDO $pdo)
    {
        $this->seo = new SeoService($pdo);
    }

    public function render(): void
    {
        $path = (string) (Request::query('path') ?? '/');
        parse_str((string) (Request::query('query') ?? ''), $query);
        $query = array_filter(array_map(fn ($v) => is_scalar($v) ? (string) $v : '', $query), fn ($v) => $v !== '');

        header('Cache-Control: public, max-age=300');
        Response::json($this->seo->render($path, $query));
    }

    public function robots(): void
    {
        $this->text($this->seo->robotsTxt(), 'text/plain');
    }

    public function sitemapIndex(): void
    {
        $this->text($this->seo->sitemapIndex(), 'application/xml');
    }

    public function sitemapPart(string $part): void
    {
        $xml = $this->seo->sitemapPart($part);
        if ($xml === null) {
            Response::error('Sitemap not found', 404);
        }
        $this->text($xml, 'application/xml');
    }

    public function merchantFeed(): void
    {
        @set_time_limit(120);
        $this->text($this->seo->merchantFeed(), 'application/xml');
    }

    private function text(string $body, string $type): never
    {
        http_response_code(200);
        header("Content-Type: {$type}; charset=utf-8");
        header('Cache-Control: public, max-age=3600');
        echo $body;
        exit;
    }
}
