-- Listing photography (web-first marketplace).
--
-- The public website makes the property the visual hero, which requires
-- images the API can actually serve. `media_asset` already existed but held
-- only an opaque `storage_ref` produced by the V1 mock provider — no MIME
-- type, no size, and no bytes behind it. These columns are NULLABLE because
-- every pre-existing row genuinely has no file, and a NOT NULL default
-- would assert a fact about those rows that is not true.

ALTER TABLE "media_asset" ADD COLUMN "mime_type" TEXT;
ALTER TABLE "media_asset" ADD COLUMN "byte_size" INTEGER;

-- Provenance is a first-class field, not a flag. A tenant is entitled to
-- know whether the photograph was taken by our officer, supplied by the
-- lister, or seeded for a demonstration — and a fixture must be able to
-- say so rather than pass as either of the other two.
CREATE TYPE "PhotoSource" AS ENUM ('field_officer', 'lister', 'development_fixture');

CREATE TABLE "listing_photo" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "media_asset_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT,
    "source" "PhotoSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_photo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "listing_photo_listing_id_media_asset_id_key"
    ON "listing_photo"("listing_id", "media_asset_id");

CREATE INDEX "listing_photo_listing_id_sort_order_idx"
    ON "listing_photo"("listing_id", "sort_order");

ALTER TABLE "listing_photo" ADD CONSTRAINT "listing_photo_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listing"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_photo" ADD CONSTRAINT "listing_photo_media_asset_id_fkey"
    FOREIGN KEY ("media_asset_id") REFERENCES "media_asset"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
