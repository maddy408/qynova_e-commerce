# Local Print/Scanner Bridge (optional)

A small Node.js service meant to run on the shop PC when the backend is
cloud-hosted and can't open a raw TCP socket to a LAN thermal printer or WiFi
barcode scanner (see docs section 12).

- Receives print jobs from the POS app over WebSocket/HTTP and forwards
  ESC/POS bytes to `printer_ip:9100`.
- Forwards scanned codes from a WiFi barcode scanner to the POS app over
  WebSocket.

Not needed when the backend runs on the same LAN as the printer/scanner —
in that case `POST /api/print/receipt` talks to the printer directly from
PHP. This is a Phase 6+ module (section 27); empty for now.
