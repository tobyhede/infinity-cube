CREATE TABLE "public"."images" (
  "bytes" bytea NOT NULL,
  "created_at" timestamptz DEFAULT (now()) NOT NULL,
  "id" text NOT NULL,
  "media_type" text NOT NULL,
  PRIMARY KEY ("id")
);
