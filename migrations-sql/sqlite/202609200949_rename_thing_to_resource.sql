CREATE TABLE "resources" (
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "document" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "space_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("space_id") REFERENCES "spaces" ("id") ON DELETE CASCADE
);

CREATE INDEX "resources_space_id_idx" ON "resources" ("space_id");

DROP TABLE "things";
