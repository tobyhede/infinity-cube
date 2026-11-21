CREATE TABLE "assets" (
  "bytes" BLOB NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "hash" TEXT NOT NULL,
  "media_type" TEXT NOT NULL,
  PRIMARY KEY ("hash")
);

DROP TABLE "images";
