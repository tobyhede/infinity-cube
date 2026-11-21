CREATE TABLE "images" (
  "bytes" BLOB NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "id" TEXT NOT NULL,
  "media_type" TEXT NOT NULL,
  PRIMARY KEY ("id")
);
