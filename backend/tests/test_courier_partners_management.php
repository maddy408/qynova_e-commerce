<?php

declare(strict_types=1);

/**
 * Production test suite for Courier Partners Management module.
 * Tests on unified_pos_test database.
 */

require_once __DIR__ . '/../vendor/autoload.php';

use App\Services\CourierPartnerService;

echo "=== COURIER PARTNERS MANAGEMENT TEST SUITE ===\n";

$dbName = 'unified_pos_test';
$pdo = new PDO("mysql:host=127.0.0.1;dbname={$dbName};charset=utf8mb4", 'root', 'Mysql@1234', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

echo "✓ Connected safely to test database: {$dbName}\n";

$service = new CourierPartnerService($pdo);

// 1. Test Summary Metrics
echo "-> Testing summary metrics...\n";
$summary = $service->summary();
assert(isset($summary['total_partners']['count']), "Summary must have total_partners");
assert(isset($summary['active_partners']['count']), "Summary must have active_partners");
assert(isset($summary['pending_setup']['count']), "Summary must have pending_setup");
assert(isset($summary['integration_issues']['count']), "Summary must have integration_issues");
assert($summary['total_partners']['count'] >= 6, "Must have at least 6 seeded partners");
assert($summary['active_partners']['count'] >= 4, "Must have at least 4 active partners");
echo "✓ Summary metrics validated: " . json_encode($summary) . "\n";

// 2. Test List & Filters
echo "-> Testing list with filters...\n";
$all = $service->list();
assert($all['total'] >= 6, "Total partners must be >= 6");

// Search filter
$searchRes = $service->list(['search' => 'Delhivery']);
assert($searchRes['total'] >= 1, "Search for Delhivery must return at least 1 record");
assert($searchRes['items'][0]['code'] === 'DELHIVERY', "Found item must be DELHIVERY");

// Status filter: ACTIVE
$activeRes = $service->list(['status' => 'ACTIVE']);
foreach ($activeRes['items'] as $item) {
    assert($item['status'] === 'ACTIVE', "All items must be ACTIVE");
}

// Status filter: PENDING
$pendingRes = $service->list(['status' => 'PENDING']);
foreach ($pendingRes['items'] as $item) {
    assert($item['status'] === 'PENDING', "All items must be PENDING");
}
echo "✓ List & filters verified\n";

// 3. Test Find Single Partner (Delhivery)
echo "-> Testing find single partner with details...\n";
$delhivery = $service->find((int) $searchRes['items'][0]['id']);
assert($delhivery !== null, "Partner Delhivery must exist");
assert($delhivery['account_id'] === 'DLV001234', "Account ID must match DLV001234");
assert(in_array('STANDARD', $delhivery['supported_services'], true), "Must support STANDARD");
assert(in_array('COD', $delhivery['supported_services'], true), "Must support COD");
assert(str_starts_with($delhivery['masked_api_key'], '••••'), "API key must be masked");
assert(isset($delhivery['sync_logs']), "Must include sync logs");
echo "✓ Partner detail and masked credentials verified\n";

// 4. Test Create New Courier Partner
echo "-> Testing partner creation...\n";
$testCode = 'TEST_EXP_' . time();
$testAcc = 'ACC_' . time();
$newId = $service->create([
    'name' => 'FastTrack Express',
    'code' => $testCode,
    'subtitle' => 'Same Day Logistics',
    'account_id' => $testAcc,
    'company_name' => 'FastTrack Logistics Pvt Ltd',
    'contact_person' => 'Ramesh M',
    'email' => 'ramesh@fasttrack.in',
    'phone' => '+91 99887 76655',
    'website' => 'www.fasttrack.in',
    'api_key' => 'FT_LIVE_SECRET_KEY_9988',
    'api_base_url' => 'https://api.fasttrack.in/v1',
    'supported_services' => ['STANDARD', 'EXPRESS', 'COD'],
    'service_areas' => ['Tamil Nadu', 'Kerala'],
    'status' => 'ACTIVE',
], 1);

assert($newId > 0, "Created partner ID must be > 0");
$created = $service->find($newId);
assert($created['name'] === 'FastTrack Express', "Created name must match");
assert($created['masked_api_key'] === '••••••••9988', "Last 4 chars of API key must be visible");
echo "✓ Courier partner created successfully: ID {$newId}\n";

// 5. Test Duplicate Code Rejection
echo "-> Testing duplicate provider code rejection...\n";
$duplicateCaught = false;
try {
    $service->create([
        'name' => 'Duplicate Express',
        'code' => $testCode,
        'account_id' => 'ACC_DIFF_' . time(),
    ], 1);
} catch (InvalidArgumentException $e) {
    $duplicateCaught = true;
    echo "✓ Correctly rejected duplicate provider code: " . $e->getMessage() . "\n";
}
assert($duplicateCaught, "Must reject duplicate provider code");

// 6. Test Credential Rotation & Update
echo "-> Testing partner update with credential rotation...\n";
$updated = $service->update($newId, [
    'contact_person' => 'Suresh Senior Ops',
    'api_key' => 'ROTATED_API_KEY_7744',
], 1);
assert($updated['contact_person'] === 'Suresh Senior Ops', "Contact person must be updated");
assert($updated['masked_api_key'] === '••••••••7744', "Masked key must reflect rotated key suffix");
echo "✓ Partner update and credential rotation verified\n";

// 7. Test Connection Test
echo "-> Testing connection test...\n";
$testConn = $service->testConnection($newId);
assert($testConn['success'] === true, "Connection test must succeed when URL and key exist");
assert($testConn['status'] === 'CONNECTED', "Integration status must be CONNECTED");
assert($testConn['latency_ms'] > 0, "Latency must be recorded");

$reloaded = $service->find($newId);
assert($reloaded['integration_status'] === 'CONNECTED', "Partner integration status must be CONNECTED");
assert(count($reloaded['sync_logs']) > 0, "Sync log must record the connection test");
echo "✓ Provider connection test and sync audit log verified\n";

// 8. Test Status Toggle & Inactive Transition
echo "-> Testing status toggle...\n";
$deactivated = $service->toggleStatus($newId, 'INACTIVE');
assert($deactivated['status'] === 'INACTIVE', "Status must transition to INACTIVE");
$reactivated = $service->toggleStatus($newId, 'ACTIVE');
assert($reactivated['status'] === 'ACTIVE', "Status must transition back to ACTIVE");
echo "✓ Status toggle verified\n";

// 9. Clean up test record
$pdo->prepare("DELETE FROM courier_sync_logs WHERE courier_partner_id = :id")->execute(['id' => $newId]);
$pdo->prepare("DELETE FROM courier_partners WHERE id = :id")->execute(['id' => $newId]);
echo "✓ Cleaned up test courier partner\n";

echo "\n============================================================\n";
echo "✓ ALL COURIER PARTNERS BACKEND TESTS PASSED 100%!\n";
echo "============================================================\n";
