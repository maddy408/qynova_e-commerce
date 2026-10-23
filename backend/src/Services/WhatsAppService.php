<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Config;
use PDO;

/**
 * Sends the "your order has been dispatched" WhatsApp message for
 * beyond-radius (India Post) orders, via Meta's WhatsApp Business Cloud
 * API. Follows the same "durable record first, best-effort external
 * send second" idiom as NotificationDispatcher: a delivery_tracking_messages
 * row is written BEFORE the API call is even attempted, so "credentials
 * not configured" and "API call failed" both leave an auditable trail
 * instead of silently vanishing — and a failed send never throws back
 * into the caller (DeliveryController just checks the returned 'sent'
 * flag to decide whether to show the wa.me fallback button).
 *
 * Fully inert (isConfigured() === false) until both
 * WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN are set in .env.
 */
final class WhatsAppService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function isConfigured(): bool
    {
        return trim((string) Config::get('whatsapp.phone_number_id', '')) !== ''
            && trim((string) Config::get('whatsapp.access_token', '')) !== '';
    }

    /**
     * @return array{sent: bool, configured: bool, message_id: int}
     */
    public function sendTrackingUpdate(int $orderId, string $phone, string $orderNo, string $trackingId, string $courierName): array
    {
        $logId = $this->logMessage($orderId, $phone, (string) Config::get('whatsapp.template_name'), [
            'order_no' => $orderNo,
            'tracking_id' => $trackingId,
            'courier_name' => $courierName,
        ]);

        if (!$this->isConfigured()) {
            $this->updateMessageStatus($logId, 'SKIPPED_UNCONFIGURED');

            return ['sent' => false, 'configured' => false, 'message_id' => $logId];
        }

        try {
            $providerMessageId = $this->callCloudApi($phone, $orderNo, $trackingId, $courierName);
            $this->updateMessageStatus($logId, 'SENT', $providerMessageId);

            return ['sent' => true, 'configured' => true, 'message_id' => $logId];
        } catch (\Throwable $e) {
            error_log('WhatsAppService: send failed: ' . $e->getMessage());
            $this->updateMessageStatus($logId, 'FAILED', null, $e->getMessage());

            return ['sent' => false, 'configured' => true, 'message_id' => $logId];
        }
    }

    /** Direct WhatsApp Web URL (best for desktop / admin-pos when WhatsApp Web is already open). */
    public function webUrl(string $phone, string $orderNo, string $trackingId, string $courierName, ?string $customerName = null, ?string $note = null): string
    {
        return 'https://web.whatsapp.com/send?phone=' . $this->toInternationalDigits($phone) . '&text=' . rawurlencode($this->trackingMessage($orderNo, $trackingId, $courierName, $customerName, $note));
    }

    /** wa.me click-to-chat fallback (works well on mobile or redirects). */
    public function clickToChatUrl(string $phone, string $orderNo, string $trackingId, string $courierName, ?string $customerName = null, ?string $note = null): string
    {
        return 'https://wa.me/' . $this->toInternationalDigits($phone) . '?text=' . rawurlencode($this->trackingMessage($orderNo, $trackingId, $courierName, $customerName, $note));
    }

    public function trackingMessage(string $orderNo, string $trackingId, string $courierName, ?string $customerName = null, ?string $note = null): string
    {
        $name = trim((string) $customerName);
        $greeting = $name !== '' ? "Hi {$name}! 👋" : "Hi! 👋";
        $msg = "{$greeting}\n\n";
        $msg .= "Your order *#{$orderNo}* from *Shop with Adam* has been dispatched via *{$courierName}*.\n\n";
        $msg .= "📦 *Tracking ID:* {$trackingId}\n";
        if ($note !== null && trim($note) !== '') {
            $msg .= "📝 *Status:* " . trim($note) . "\n";
        }
        $msg .= "\n🌐 *Track your parcel:* https://www.indiapost.gov.in/\n\n";
        $msg .= "Thank you for shopping with us! 🙏";

        return $msg;
    }

    /** Matches the existing wa.me/91{phone} convention (InvoiceDetailPage.tsx, GroceryFooter.jsx). */
    public function toInternationalDigits(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        if (str_starts_with($digits, '0') && strlen($digits) === 11) {
            $digits = substr($digits, 1);
        }

        return strlen($digits) === 10 ? "91{$digits}" : $digits;
    }

    public function logManualSent(int $orderId, string $phone, string $orderNo, string $trackingId, string $courierName, ?string $note = null): int
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO delivery_tracking_messages (order_id, channel, recipient_phone, template_name, payload_sanitized, status, sent_at)
             VALUES (:order_id, "WHATSAPP_CLICK_TO_CHAT", :phone, "order_tracking_web_chat", :payload, "SENT", NOW())'
        );
        $stmt->execute([
            'order_id' => $orderId,
            'phone' => $phone,
            'payload' => json_encode([
                'order_no' => $orderNo,
                'tracking_id' => $trackingId,
                'courier_name' => $courierName,
                'status_note' => $note,
            ]),
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @return string|null provider message id */
    private function callCloudApi(string $phone, string $orderNo, string $trackingId, string $courierName): ?string
    {
        $phoneNumberId = (string) Config::get('whatsapp.phone_number_id');
        $accessToken = (string) Config::get('whatsapp.access_token');

        $payload = [
            'messaging_product' => 'whatsapp',
            'to' => $this->toInternationalDigits($phone),
            'type' => 'template',
            'template' => [
                'name' => (string) Config::get('whatsapp.template_name'),
                'language' => ['code' => (string) Config::get('whatsapp.template_language')],
                'components' => [[
                    'type' => 'body',
                    'parameters' => [
                        ['type' => 'text', 'text' => $orderNo],
                        ['type' => 'text', 'text' => $courierName],
                        ['type' => 'text', 'text' => $trackingId],
                    ],
                ]],
            ],
        ];

        $ch = curl_init("https://graph.facebook.com/v21.0/{$phoneNumberId}/messages");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => [
                "Authorization: Bearer {$accessToken}",
                'Content-Type: application/json',
            ],
            CURLOPT_TIMEOUT => 10,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            throw new \RuntimeException("cURL error calling WhatsApp Cloud API: {$curlError}");
        }

        $decoded = json_decode((string) $response, true);

        if ($status < 200 || $status >= 300) {
            $errorMessage = $decoded['error']['message'] ?? "HTTP {$status}";
            throw new \RuntimeException("WhatsApp Cloud API error: {$errorMessage}");
        }

        return $decoded['messages'][0]['id'] ?? null;
    }

    /** @param array<string, string> $payload */
    private function logMessage(int $orderId, string $phone, ?string $templateName, array $payload): int
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO delivery_tracking_messages (order_id, channel, recipient_phone, template_name, payload_sanitized, status)
             VALUES (:order_id, "WHATSAPP_CLOUD_API", :phone, :template, :payload, "PENDING")'
        );
        $stmt->execute([
            'order_id' => $orderId,
            'phone' => $phone,
            'template' => $templateName,
            'payload' => json_encode($payload),
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    private function updateMessageStatus(int $id, string $status, ?string $providerMessageId = null, ?string $errorMessage = null): void
    {
        $stmt = $this->pdo->prepare(
            'UPDATE delivery_tracking_messages
             SET status = :status, provider_message_id = :provider_message_id, error_message = :error_message,
                 sent_at = IF(:status2 = "SENT", NOW(), sent_at)
             WHERE id = :id'
        );
        $stmt->execute([
            'status' => $status,
            'status2' => $status,
            'provider_message_id' => $providerMessageId,
            'error_message' => $errorMessage,
            'id' => $id,
        ]);
    }
}
