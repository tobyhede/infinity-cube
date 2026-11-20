DROP TABLE "public"."things";

CREATE TABLE "public"."resources" (
  "created_at" timestamptz DEFAULT (now()) NOT NULL,
  "document" jsonb NOT NULL,
  "id" "uuid" DEFAULT (gen_random_uuid()) NOT NULL,
  "space_id" "uuid" NOT NULL,
  "updated_at" timestamptz NOT NULL,
  PRIMARY KEY ("id")
);

CREATE INDEX "resources_space_id_idx" ON "public"."resources" ("space_id");

ALTER TABLE "public"."resources"
ADD CONSTRAINT "resources_space_id_fkey"
FOREIGN KEY ("space_id")
REFERENCES "public"."spaces" ("id")
ON DELETE CASCADE;
