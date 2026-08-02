-- Storefront templates for the merchant signup wizard (shared/templates.ts).
-- A template names the surface half of the storefront palette (grounds,
-- surfaces, borders, muted text); the existing primary_color keeps driving
-- the ink/accent half. Null means "no template chosen" and renders exactly
-- as before this migration (the index.css defaults), so existing stores are
-- untouched.
ALTER TABLE `tenant_settings` ADD COLUMN `template_id` varchar(32);
