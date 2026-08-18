-- Review-link tokens get a lifetime, and stop existing once spent.
--
-- The one-click links in the reconciliation and POS-attribution review emails
-- are bearer credentials: whoever holds the mail can spend them, with no login.
-- They previously had no expiry, and survived in the row after the decision was
-- recorded, so a forwarded or leaked mailbox stayed actionable indefinitely.
--
-- `tokenExpiresAt` bounds a link's life; the code treats NULL as expired, so
-- existing rows are backfilled from their creation date rather than being
-- grandfathered into never expiring. `confirmationToken` becomes nullable so a
-- spent token can be cleared outright — MySQL allows many NULLs under a UNIQUE
-- constraint, so the uniqueness of live tokens is unaffected.
ALTER TABLE `stripe_reconciliations` ADD `tokenExpiresAt` timestamp NULL;
ALTER TABLE `pos_attributions` ADD `tokenExpiresAt` timestamp NULL;

ALTER TABLE `stripe_reconciliations` MODIFY `confirmationToken` varchar(128) NULL;
ALTER TABLE `pos_attributions` MODIFY `confirmationToken` varchar(128) NULL;

UPDATE `stripe_reconciliations`
  SET `tokenExpiresAt` = DATE_ADD(`createdAt`, INTERVAL 14 DAY)
  WHERE `tokenExpiresAt` IS NULL;
UPDATE `pos_attributions`
  SET `tokenExpiresAt` = DATE_ADD(`createdAt`, INTERVAL 14 DAY)
  WHERE `tokenExpiresAt` IS NULL;
