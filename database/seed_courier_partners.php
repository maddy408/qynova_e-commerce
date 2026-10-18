<?php
declare(strict_types=1);

$databases = ['unified_pos', 'unified_pos_test'];

$partners = [
    [
        'name' => 'Delhivery',
        'code' => 'DELHIVERY',
        'subtitle' => 'Express Delivery',
        'account_id' => 'DLV001234',
        'company_name' => 'Delhivery Ltd.',
        'contact_person' => 'Support Team',
        'email' => 'support@delhivery.com',
        'phone' => '+91 1800 103 3322',
        'website' => 'www.delhivery.com',
        'supported_services' => json_encode(['STANDARD', 'EXPRESS', 'COD', 'PICKUP_DROP']),
        'service_areas' => json_encode(['Tamil Nadu', 'Kerala', 'Karnataka', 'Andhra Pradesh', 'Telangana', 'Maharashtra']),
        'status' => 'ACTIVE',
        'integration_status' => 'CONNECTED',
        'api_base_url' => 'https://track.delhivery.com/api/v1',
        'webhook_url' => 'https://api.example.com/webhook/delhivery',
        'masked_api_key' => '••••••••••••••',
        'total_shipments' => 1248,
        'success_rate' => 98.50,
        'avg_delivery_days' => 2.4,
        'last_sync_at' => '2026-10-17 14:15:00',
    ],
    [
        'name' => 'Blue Dart',
        'code' => 'BLUEDART',
        'subtitle' => 'Premium Courier',
        'account_id' => 'BD789012',
        'company_name' => 'Blue Dart Express Ltd.',
        'contact_person' => 'Enterprise Support',
        'email' => 'support@bluedart.com',
        'phone' => '+91 1860 233 1234',
        'website' => 'www.bluedart.com',
        'supported_services' => json_encode(['STANDARD', 'EXPRESS', 'COD']),
        'service_areas' => json_encode(['Tamil Nadu', 'Karnataka', 'Maharashtra', 'Delhi NCR']),
        'status' => 'ACTIVE',
        'integration_status' => 'CONNECTED',
        'api_base_url' => 'https://api.bluedart.com/v1',
        'webhook_url' => 'https://api.example.com/webhook/bluedart',
        'masked_api_key' => '••••••••••••••',
        'total_shipments' => 842,
        'success_rate' => 99.10,
        'avg_delivery_days' => 1.8,
        'last_sync_at' => '2026-10-17 13:45:00',
    ],
    [
        'name' => 'Ekart',
        'code' => 'EKART',
        'subtitle' => 'E-commerce Logistics',
        'account_id' => 'EK567890',
        'company_name' => 'Instakart Services Pvt. Ltd.',
        'contact_person' => 'Merchant Desk',
        'email' => 'merchant@ekartlogistics.com',
        'phone' => '+91 1800 208 9898',
        'website' => 'www.ekartlogistics.com',
        'supported_services' => json_encode(['STANDARD', 'EXPRESS', 'COD']),
        'service_areas' => json_encode(['All India', 'Tamil Nadu', 'Karnataka']),
        'status' => 'ACTIVE',
        'integration_status' => 'CONNECTED',
        'api_base_url' => 'https://api.ekartlogistics.com/v2',
        'webhook_url' => 'https://api.example.com/webhook/ekart',
        'masked_api_key' => '••••••••••••••',
        'total_shipments' => 630,
        'success_rate' => 97.80,
        'avg_delivery_days' => 2.6,
        'last_sync_at' => '2026-10-17 12:20:00',
    ],
    [
        'name' => 'Shadowfax',
        'code' => 'SHADOWFAX',
        'subtitle' => 'Last Mile Delivery',
        'account_id' => 'SF345678',
        'company_name' => 'Shadowfax Technologies Pvt. Ltd.',
        'contact_person' => 'Partner Operations',
        'email' => 'help@shadowfax.in',
        'phone' => '+91 80 6817 2500',
        'website' => 'www.shadowfax.in',
        'supported_services' => json_encode(['STANDARD', 'EXPRESS', 'COD', 'PICKUP_DROP']),
        'service_areas' => json_encode(['Tamil Nadu', 'Puducherry', 'Karnataka']),
        'status' => 'ACTIVE',
        'integration_status' => 'CONNECTED',
        'api_base_url' => 'https://api.shadowfax.in/v2',
        'webhook_url' => 'https://api.example.com/webhook/shadowfax',
        'masked_api_key' => '••••••••••••••',
        'total_shipments' => 415,
        'success_rate' => 96.90,
        'avg_delivery_days' => 2.1,
        'last_sync_at' => '2026-10-16 18:30:00',
    ],
    [
        'name' => 'Ecom Express',
        'code' => 'ECOM_EXPRESS',
        'subtitle' => 'Logistics Partner',
        'account_id' => 'EE901234',
        'company_name' => 'Ecom Express Ltd.',
        'contact_person' => 'Onboarding Desk',
        'email' => 'support@ecomexpress.in',
        'phone' => '+91 8826 395 555',
        'website' => 'www.ecomexpress.in',
        'supported_services' => json_encode(['STANDARD', 'EXPRESS']),
        'service_areas' => json_encode(['All India']),
        'status' => 'PENDING',
        'integration_status' => 'PENDING',
        'api_base_url' => 'https://api.ecomexpress.in/v1',
        'webhook_url' => 'https://api.example.com/webhook/ecomexpress',
        'masked_api_key' => '••••••••••••••',
        'total_shipments' => 0,
        'success_rate' => 0.00,
        'avg_delivery_days' => 0.0,
        'last_sync_at' => '2026-10-16 16:10:00',
    ],
    [
        'name' => 'Xpressbees',
        'code' => 'XPRESSBEES',
        'subtitle' => 'Supply Chain',
        'account_id' => 'XB567890',
        'company_name' => 'BusyBees Logistics Solutions Pvt. Ltd.',
        'contact_person' => 'Client Servicing',
        'email' => 'customercare@xpressbees.com',
        'phone' => '+91 20 4911 1900',
        'website' => 'www.xpressbees.com',
        'supported_services' => json_encode(['STANDARD', 'COD']),
        'service_areas' => json_encode(['West India', 'North India']),
        'status' => 'INACTIVE',
        'integration_status' => 'UNCONFIGURED',
        'api_base_url' => 'https://api.xpressbees.com/v1',
        'webhook_url' => 'https://api.example.com/webhook/xpressbees',
        'masked_api_key' => '••••••••••••••',
        'total_shipments' => 112,
        'success_rate' => 94.20,
        'avg_delivery_days' => 3.2,
        'last_sync_at' => '2026-10-15 11:05:00',
    ],
];

foreach ($databases as $db) {
    echo "Seeding courier partners in database: {$db}...\n";
    $pdo = new PDO("mysql:host=127.0.0.1;dbname={$db};charset=utf8mb4", 'root', 'Mysql@1234', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    $stmt = $pdo->prepare(
        "INSERT INTO courier_partners (
            name, code, subtitle, account_id, company_name, contact_person, email, phone, website,
            supported_services, service_areas, status, integration_status, api_base_url, webhook_url,
            masked_api_key, total_shipments, success_rate, avg_delivery_days, last_sync_at
        ) VALUES (
            :name, :code, :subtitle, :account_id, :company_name, :contact_person, :email, :phone, :website,
            :supported_services, :service_areas, :status, :integration_status, :api_base_url, :webhook_url,
            :masked_api_key, :total_shipments, :success_rate, :avg_delivery_days, :last_sync_at
        ) ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            subtitle = VALUES(subtitle),
            account_id = VALUES(account_id),
            company_name = VALUES(company_name),
            contact_person = VALUES(contact_person),
            email = VALUES(email),
            phone = VALUES(phone),
            website = VALUES(website),
            supported_services = VALUES(supported_services),
            service_areas = VALUES(service_areas),
            status = VALUES(status),
            integration_status = VALUES(integration_status),
            api_base_url = VALUES(api_base_url),
            webhook_url = VALUES(webhook_url),
            masked_api_key = VALUES(masked_api_key),
            total_shipments = VALUES(total_shipments),
            success_rate = VALUES(success_rate),
            avg_delivery_days = VALUES(avg_delivery_days),
            last_sync_at = VALUES(last_sync_at)"
    );

    foreach ($partners as $p) {
        $stmt->execute([
            'name' => $p['name'],
            'code' => $p['code'],
            'subtitle' => $p['subtitle'],
            'account_id' => $p['account_id'],
            'company_name' => $p['company_name'],
            'contact_person' => $p['contact_person'],
            'email' => $p['email'],
            'phone' => $p['phone'],
            'website' => $p['website'],
            'supported_services' => $p['supported_services'],
            'service_areas' => $p['service_areas'],
            'status' => $p['status'],
            'integration_status' => $p['integration_status'],
            'api_base_url' => $p['api_base_url'],
            'webhook_url' => $p['webhook_url'],
            'masked_api_key' => $p['masked_api_key'],
            'total_shipments' => $p['total_shipments'],
            'success_rate' => $p['success_rate'],
            'avg_delivery_days' => $p['avg_delivery_days'],
            'last_sync_at' => $p['last_sync_at'],
        ]);
        echo "  Upserted partner: {$p['name']} ({$p['code']})\n";
    }

    // Seed sample sync log for Delhivery
    $delhiveryId = $pdo->query("SELECT id FROM courier_partners WHERE code = 'DELHIVERY'")->fetchColumn();
    if ($delhiveryId) {
        $pdo->prepare(
            "INSERT INTO courier_sync_logs (courier_partner_id, event_type, status, message, payload_sanitized, created_at)
             VALUES (:pid, 'CONNECTION_TEST', 'SUCCESS', 'Connection verified with Delhivery Tracking Gateway API v1', JSON_OBJECT('status_code', 200, 'latency_ms', 142), '2026-10-17 14:15:00')"
        )->execute(['pid' => $delhiveryId]);
    }
}
echo "✓ Courier partners seeding complete!\n";
