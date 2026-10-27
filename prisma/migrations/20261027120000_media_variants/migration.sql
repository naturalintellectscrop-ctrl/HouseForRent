-- 20261027120000_media_variants — additive image-pipeline metadata.
--
-- What this migration does: adds the MediaVariantName enum and the
-- media_variant table (derived-rendition metadata: storage key, variant,
-- dimensions, byte size, content type, processing status), plus the
-- MediaAsset↔MediaVariant relation with CASCADE delete.
--
-- What it deliberately does NOT do: touch any existing row, column or
-- table. Fully additive; reversible by dropping the table and the enum.
-- Applied by scripts/apply-migration.mjs (guarded; records itself in
-- _prisma_migrations so the ledger stays truthful for future deploys).

CREATE TYPE "MediaVariantName" AS ENUM ('thumb', 'card', 'detail');

CREATE TABLE "media_variant" (
    "id" TEXT NOT NULL,
    "media_asset_id" TEXT NOT NULL,
    "variant" "MediaVariantName" NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "processing_status" TEXT NOT NULL DEFAULT 'ready',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_variant_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "media_variant"
  ADD CONSTRAINT "media_variant_media_asset_id_fkey"
  FOREIGN KEY ("media_asset_id") REFERENCES "media_asset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "media_variant_media_asset_id_variant_key"
  ON "media_variant"("media_asset_id", "variant");
CREATE INDEX "media_variant_media_asset_id_idx"
  ON "media_variant"("media_asset_id");
