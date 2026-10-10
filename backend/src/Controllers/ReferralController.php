<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\ReferralService;
use PDO;

final class ReferralController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function getSettings(): void
    {
        Response::json(['settings' => (new ReferralService($this->pdo))->getSettings()]);
    }

    public function updateSettings(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'settings.manage');

        (new ReferralService($this->pdo))->updateSettings(Request::json());

        Response::json(['settings' => (new ReferralService($this->pdo))->getSettings()]);
    }

    /** Admin referral report (ECOMMERCE_POS_ADMIN_SPEC.md section 4). */
    public function report(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.financial.view');

        $totals = $this->pdo->query(
            "SELECT
                COUNT(*) AS total_referrals,
                COALESCE(SUM(status IN ('ELIGIBLE', 'APPLIED')), 0) AS successful_referrals,
                COALESCE(SUM(status = 'PENDING'), 0) AS pending_referrals
             FROM referrals"
        )->fetch();

        $discountGiven = $this->pdo->query(
            "SELECT COALESCE(SUM(discount_amount), 0) AS total FROM referral_rewards WHERE status = 'APPLIED'"
        )->fetchColumn();

        $topReferrers = $this->pdo->query(
            "SELECT c.id, c.name, COUNT(*) AS referral_count
             FROM referrals r JOIN customers c ON c.id = r.referrer_customer_id
             GROUP BY c.id, c.name ORDER BY referral_count DESC LIMIT 10"
        )->fetchAll();

        Response::json([
            'totals' => $totals,
            'referral_discount_given' => (float) $discountGiven,
            'top_referrers' => $topReferrers,
        ]);
    }
}
