CREATE TABLE "public"."repository_state" (
  "meta_space_id" "uuid" NOT NULL,
  "singleton_id" int4 DEFAULT 1 NOT NULL,
  PRIMARY KEY ("singleton_id")
);

ALTER TABLE "public"."repository_state" ADD CONSTRAINT "repository_state_singleton_id_check" CHECK ("singleton_id" IN ('1'));

INSERT INTO "public"."repository_state" ("meta_space_id", "singleton_id") SELECT "id", 1 FROM "public"."spaces" WHERE "entry" = TRUE LIMIT 1;
