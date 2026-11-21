CREATE TABLE "repository_state" (
  "meta_space_id" TEXT NOT NULL,
  "singleton_id" INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY ("singleton_id"),
  FOREIGN KEY ("meta_space_id") REFERENCES "spaces" ("id") ON DELETE RESTRICT
);

CREATE TABLE "spaces" (
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "document" TEXT NOT NULL,
  "exported_revision" TEXT,
  "id" TEXT NOT NULL,
  "revision" TEXT NOT NULL DEFAULT '0',
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE "things" (
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "document" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "space_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("space_id") REFERENCES "spaces" ("id") ON DELETE CASCADE
);

CREATE INDEX "repository_state_meta_space_id_idx" ON "repository_state" ("meta_space_id");

CREATE INDEX "things_space_id_idx" ON "things" ("space_id");
