-- Background/overlay image for a home page section. Folded in from an
-- ad-hoc alter_home_sections.php script (now removed) that had bypassed
-- the migration system — this file makes that schema change properly
-- tracked so a fresh `php database/migrate.php` run produces the same
-- schema this dev database already has.

ALTER TABLE home_sections
    ADD COLUMN image_path VARCHAR(255) NULL AFTER title;
