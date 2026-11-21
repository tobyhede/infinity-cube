DROP TABLE "public"."cards";

CREATE TABLE "public"."things" (
  "created_at" timestamptz DEFAULT (now()) NOT NULL,
  "document" jsonb NOT NULL,
  "id" "uuid" DEFAULT (gen_random_uuid()) NOT NULL,
  "space_id" "uuid" NOT NULL,
  "updated_at" timestamptz NOT NULL,
  PRIMARY KEY ("id")
);

CREATE INDEX "things_space_id_idx" ON "public"."things" ("space_id");

ALTER TABLE "public"."things"
ADD CONSTRAINT "things_space_id_fkey"
FOREIGN KEY ("space_id")
REFERENCES "public"."spaces" ("id")
ON DELETE CASCADE;
