-- Replace the placeholder "KiranaBazaar" store data (from 0024) with Shop with Adams.
-- Only values that are STILL the original placeholders are changed, so anything
-- already edited in Admin > Store Settings / Pages is left alone.
-- Contact details (phone, WhatsApp, email, address) are cleared, not invented:
-- fill them in Admin > Store Settings. The storefront hides them until they are set.

UPDATE store_settings SET store_name = 'Shop with Adams' WHERE store_name IN ('KiranaBazaar', 'Supermarket');
UPDATE store_settings SET tagline = 'Online Grocery & Daily Essentials' WHERE tagline IN ('Your Trusted Neighborhood Store', 'Online Supermarket Store');
UPDATE store_settings
   SET description = 'Shop with Adams is an online store for groceries and daily essentials - atta, rice, dals, oils, masalas, snacks, beverages, personal care and home care from trusted brands, delivered across India.'
 WHERE description IS NULL OR description LIKE '%Korean jewellery%' OR description = 'Your trusted neighborhood supermarket.';
UPDATE store_settings SET phone = NULL WHERE phone = '+91 98765 01234';
UPDATE store_settings SET whatsapp_number = NULL WHERE whatsapp_number = '919876501234';
UPDATE store_settings SET email = NULL WHERE email = 'support@kiranabazaar.in';
UPDATE store_settings SET address = NULL WHERE address = 'Plot 42, Commercial Avenue, Sector 5';
UPDATE store_settings SET city = NULL WHERE city = 'Jaipur';
UPDATE store_settings SET state = NULL WHERE state = 'Rajasthan';
UPDATE store_settings SET pincode = NULL WHERE pincode = '302001';
UPDATE store_settings SET copyright_text = 'Shop with Adams. All rights reserved.' WHERE copyright_text LIKE '%KiranaBazaar%';

ALTER TABLE store_settings
    MODIFY store_name VARCHAR(150) NOT NULL DEFAULT 'Shop with Adams',
    MODIFY tagline VARCHAR(255) NULL DEFAULT NULL,
    MODIFY phone VARCHAR(50) NULL DEFAULT NULL,
    MODIFY whatsapp_number VARCHAR(50) NULL DEFAULT NULL,
    MODIFY email VARCHAR(150) NULL DEFAULT NULL,
    MODIFY address VARCHAR(255) NULL DEFAULT NULL,
    MODIFY city VARCHAR(100) NULL DEFAULT NULL,
    MODIFY state VARCHAR(100) NULL DEFAULT NULL,
    MODIFY pincode VARCHAR(20) NULL DEFAULT NULL,
    MODIFY copyright_text VARCHAR(255) NULL DEFAULT NULL;

-- ---------------------------------------------------------------- pages
UPDATE pages SET content =
'Shop with Adams delivers groceries and daily essentials across India.

Order processing
Orders are packed and dispatched within 24 hours (excluding Sundays and public holidays). You will get an update when your order is shipped.

Delivery time
Most orders arrive within 2 to 4 business days after dispatch. Remote locations can take up to 7 business days. The expected delivery time is shown at checkout.

Delivery charges
Delivery is free on orders above Rs. 499. Orders below Rs. 499 have a delivery charge of Rs. 49. The exact charge is always shown at checkout before you pay.

Where we deliver
We deliver to serviceable PIN codes across India. Enter your PIN code on the product page to check delivery to your address.

Cash on Delivery
Cash on Delivery is available only where it is shown as a payment option at checkout.

Delays
Weather, strikes or courier issues can occasionally delay a delivery. If your order is late, contact us using the details at the bottom of every page and we will help.'
WHERE slug = 'shipping-policy' AND content LIKE 'All orders are processed and dispatched within 24 hours from our local hub%';

UPDATE pages SET title = 'Return & Refund Policy', content =
'Groceries and daily essentials are non-returnable.

For food safety and hygiene, we cannot accept returns of grocery, personal care or home care products once they are delivered, and change-of-mind returns are not possible.

Damaged, wrong or expired items
If an item arrives damaged, leaking, expired, or different from what you ordered, tell us within 48 hours of delivery with your order number and a photo of the item and its packaging. After checking, we will send a replacement or give you a full refund for that item.

Missing items
If an item is missing from your order, report it within 48 hours of delivery and we will deliver it or refund it.

Refunds
Approved refunds are made to the original payment method within 5 to 7 business days. For Cash on Delivery orders, we refund to your bank account or UPI ID.

Cancellations
You can cancel an order before it is dispatched from your order history. Prepaid orders cancelled before dispatch are refunded in full.'
WHERE slug = 'return-policy' AND content LIKE 'We offer a hassle-free 7-day return guarantee%';

UPDATE pages SET content =
'This policy explains what information Shop with Adams collects and how we use it.

What we collect
Your name, phone number, email, delivery addresses and order history; payment status from our payment partner (we never see or store your full card or UPI details); and basic device and browsing information that keeps the website working and secure.

How we use it
To process and deliver your orders, send order and delivery updates, provide customer support, prevent fraud, and - only if you agree - send offers. You can turn off promotional messages at any time.

Sharing
We share only what is needed with delivery partners (name, address, phone) and payment partners to complete your order. We do not sell your personal data.

Security
Payments are processed by a secure, PCI-DSS compliant payment gateway over encrypted (HTTPS) connections.

Your choices
You can view and update your profile and addresses in your account, and ask us to delete your account by contacting support.

Contact
For privacy questions, contact us using the details at the bottom of every page.'
WHERE slug = 'privacy-policy' AND content LIKE 'We value your trust and are committed to protecting your personal information%';

UPDATE pages SET content =
'By using the Shop with Adams website and placing an order, you agree to these terms.

Products and prices
Product images are for illustration; the actual pack design may vary. All prices are in Indian Rupees and include GST. Prices and offers can change without notice; the price at the time you place your order applies.

Orders
An order is confirmed only after payment succeeds (or, for Cash on Delivery, after confirmation). We may cancel an order if an item is out of stock, the price was shown wrongly, or the delivery address is not serviceable. In that case any amount paid is refunded in full.

Delivery, returns and refunds
Delivery and refunds follow our Shipping & Delivery Policy and Return & Refund Policy.

Your account
Keep your login details safe. You are responsible for orders placed from your account.

Fair use
Products are sold for personal and household use. We may limit quantities per order.

Governing law
These terms are governed by the laws of India.'
WHERE slug = 'terms-and-conditions' AND content LIKE 'By accessing KiranaBazaar%';

UPDATE pages SET content =
'Shop with Adams is an online store for groceries and everyday essentials.

We stock the brands Indian homes use every day - atta, rice and dals, cooking oils and ghee, masalas, snacks and biscuits, tea and coffee, breakfast foods, personal care and home care - at fair prices, with MRP and discounts shown clearly on every product.

Order online, pay securely, and get your groceries delivered to your door across India.'
WHERE slug = 'about-us' AND content LIKE 'KiranaBazaar is your neighborhood%';

UPDATE pages SET content =
'Need help with an order, a delivery or a product? We are happy to help.

Support hours: Monday to Saturday, 9:00 AM to 9:00 PM.

You can reach us by phone, WhatsApp or email - the contact details are shown at the bottom of every page. Please keep your order number ready so we can help you faster.'
WHERE slug = 'contact-us' AND content LIKE 'Our support team is available Monday to Saturday%';
