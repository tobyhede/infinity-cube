DROP TABLE "public"."images";

CREATE TABLE "public"."assets" (
  "bytes" bytea NOT NULL,
  "created_at" timestamptz DEFAULT (now()) NOT NULL,
  "hash" text NOT NULL,
  "media_type" text NOT NULL,
  PRIMARY KEY ("hash")
);
