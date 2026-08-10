-- Merchant-authored storefront content + legal identity.
--
-- Until now a store could change how its website *looked* (logo, two brand
-- colors, template) but not a word of what it *said*: the home hero, the About
-- page and the Impressum were generated templates with the store name
-- interpolated in (client/src/lib/storefrontContent.ts), and the hero
-- background was one static platform asset every store shared.
--
-- Every column below is NULL for every existing store, and NULL means "keep
-- using the generated copy" rather than "render nothing" — so this is a no-op
-- for stores that never open the Storefront page, and stays one until a
-- merchant writes something.
--
-- hero_image_url is a hosted URL rather than an upload, matching logo_url,
-- which sits on the same admin card and has always worked that way.
--
-- about_body is plain prose, blank-line separated into paragraphs. Not
-- markdown, and not HTML: no storefront surface renders merchant-supplied
-- markup today, and this keeps that true.
ALTER TABLE `tenant_settings` ADD COLUMN `hero_image_url` varchar(1024);
ALTER TABLE `tenant_settings` ADD COLUMN `hero_headline` varchar(120);
ALTER TABLE `tenant_settings` ADD COLUMN `hero_subtitle` varchar(300);
ALTER TABLE `tenant_settings` ADD COLUMN `about_body` text;

-- The legal-notice fields. The generated Impressum has always ended with a
-- note telling the merchant they are responsible for adding their company
-- form, registration or VAT number and a registered address — and then gave
-- them nowhere to put them. These are that somewhere. An imprint is a
-- published document, so unlike `tenant_secrets` these are plain columns.
ALTER TABLE `tenant_settings` ADD COLUMN `company_legal_name` varchar(255);
ALTER TABLE `tenant_settings` ADD COLUMN `company_address` text;
ALTER TABLE `tenant_settings` ADD COLUMN `vat_number` varchar(64);
ALTER TABLE `tenant_settings` ADD COLUMN `company_registration` varchar(64);
