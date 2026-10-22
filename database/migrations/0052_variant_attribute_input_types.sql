-- 0052_variant_attribute_input_types.sql
-- Admin product form, Variant Matrix task: every variant_attributes row
-- needs to know what kind of input UI it should render (Color needs a
-- swatch/hex picker, Weight/Volume/Quantity need a number+unit input,
-- everything else is a plain pick-or-add-new select).
--
-- Default option SEEDING for these 18 attributes is already handled at
-- the application layer by VariantService::ensureDefaultAttributes()
-- (runs idempotently on every listAttributes() call), so this migration
-- only adds the schema these input types need — it deliberately does not
-- re-seed option values itself, to avoid producing near-duplicate values
-- in a different format (e.g. "500 g" alongside the app layer's "500g").

ALTER TABLE variant_attributes
    ADD COLUMN input_type ENUM('color', 'select', 'number_with_unit', 'text') NOT NULL DEFAULT 'select' AFTER name,
    ADD COLUMN unit_options VARCHAR(255) NULL AFTER input_type;

UPDATE variant_attributes SET input_type = 'color' WHERE name = 'Color';
UPDATE variant_attributes SET input_type = 'number_with_unit', unit_options = 'g,kg,mg' WHERE name = 'Weight';
UPDATE variant_attributes SET input_type = 'number_with_unit', unit_options = 'ml,L' WHERE name = 'Volume';
UPDATE variant_attributes SET input_type = 'number_with_unit', unit_options = 'pcs,pack' WHERE name = 'Quantity / Count';
