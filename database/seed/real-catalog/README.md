# Dev catalog: 100 real grocery products

- `shopadams-100-products.xlsx` - 100 products / 134 variants in the app's own import template.
- `shopadams-100-product-images.zip` - one image per product (file names match the Excel).

## Import
Admin > Products > Import Excel
1. Excel file: `shopadams-100-products.xlsx`
2. Product Images ZIP: `shopadams-100-product-images.zip`
3. Tick **Auto-create missing categories/brands/units/HSN/GST/attributes**
4. Import name: e.g. "100 real grocery products (dev)" > Validate > Confirm Import

Creates 13 categories with 33 subcategories, 67 brands, real HSN codes, GST (INCLUSIVE - MRP includes tax), stock.

## Notes
- MRPs are approximate 2025-26 retail prices; selling price is a small discount. Dev data - check before going live.
- GST follows the GST 2.0 slabs (22 Sep 2025): most packaged food & personal care 5%, salt & UHT milk 0%,
  detergents/cleaners/face wash/lotion 18%. Confirm with your CA.
- Barcodes are left blank on purpose (real GTINs must come from the actual packs).
- Images: 4 are real photos from the repo (Aashirvaad atta, Amul butter, Fortune Sunlite oil, KitKat);
  the other 96 are generated "sample" pack images. Replace them with real photos later via
  Admin > Import History > Edit > Replace ZIP (keep the same file names).
- To change the list: edit `products.py`, then `python3 build.py <storefront>/public/images/products`
  (images + rows.json); the Excel is filled from the app's sample template.
