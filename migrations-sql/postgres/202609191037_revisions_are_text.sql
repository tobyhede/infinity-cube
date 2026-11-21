ALTER TABLE "public"."spaces" ALTER COLUMN "revision" DROP DEFAULT;

ALTER TABLE "public"."spaces" ALTER COLUMN "exported_revision" TYPE text USING "exported_revision"::text;

ALTER TABLE "public"."spaces" ALTER COLUMN "revision" TYPE text USING "revision"::text;

ALTER TABLE "public"."spaces" ALTER COLUMN "revision" SET DEFAULT '0';
