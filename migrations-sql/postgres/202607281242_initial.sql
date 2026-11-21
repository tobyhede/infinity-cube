CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "public"."cards" (
  "created_at" timestamptz DEFAULT (now()) NOT NULL,
  "document" jsonb NOT NULL,
  "id" "uuid" DEFAULT (gen_random_uuid()) NOT NULL,
  "space_id" "uuid" NOT NULL,
  "updated_at" timestamptz DEFAULT (now()) NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE "public"."spaces" (
  "created_at" timestamptz DEFAULT (now()) NOT NULL,
  "document" jsonb NOT NULL,
  "exported_revision" int8,
  "id" "uuid" DEFAULT (gen_random_uuid()) NOT NULL,
  "revision" int8 DEFAULT 0 NOT NULL,
  "updated_at" timestamptz DEFAULT (now()) NOT NULL,
  PRIMARY KEY ("id")
);

CREATE INDEX "cards_space_id_idx" ON "public"."cards" ("space_id");

ALTER TABLE "public"."cards"
ADD CONSTRAINT "cards_space_id_fkey"
FOREIGN KEY ("space_id")
REFERENCES "public"."spaces" ("id")
ON DELETE CASCADE;
