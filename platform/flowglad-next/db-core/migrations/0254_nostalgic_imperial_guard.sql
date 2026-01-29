DROP POLICY "Check mode (files)" ON "files" CASCADE;--> statement-breakpoint
DROP POLICY "Enable read for own organizations (files)" ON "files" CASCADE;--> statement-breakpoint
DROP TABLE "files" CASCADE;--> statement-breakpoint
DROP POLICY "Enable read for own organizations (links)" ON "links" CASCADE;--> statement-breakpoint
DROP POLICY "Check mode (links)" ON "links" CASCADE;--> statement-breakpoint
DROP TABLE "links" CASCADE;--> statement-breakpoint
DROP POLICY "Check mode (messages)" ON "messages" CASCADE;--> statement-breakpoint
DROP TABLE "messages" CASCADE;--> statement-breakpoint
DROP POLICY "Enable read for own organizations (proper_nouns)" ON "proper_nouns" CASCADE;--> statement-breakpoint
DROP POLICY "Check mode (proper_nouns)" ON "proper_nouns" CASCADE;--> statement-breakpoint
DROP TABLE "proper_nouns" CASCADE;--> statement-breakpoint
DROP POLICY "Check mode (purchase_access_sessions)" ON "purchase_access_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "purchase_access_sessions" CASCADE;