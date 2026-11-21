ALTER TABLE "public"."spaces" ADD COLUMN "entry" bool;

ALTER TABLE "public"."spaces" ADD CONSTRAINT "spaces_entry_key" UNIQUE ("entry");
