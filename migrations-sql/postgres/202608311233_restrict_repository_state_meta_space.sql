CREATE INDEX "repository_state_meta_space_id_idx" ON "public"."repository_state" ("meta_space_id");

ALTER TABLE "public"."repository_state"
ADD CONSTRAINT "repository_state_meta_space_id_fkey"
FOREIGN KEY ("meta_space_id")
REFERENCES "public"."spaces" ("id")
ON DELETE RESTRICT;
