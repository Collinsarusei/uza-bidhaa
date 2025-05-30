-- CreateTable
CREATE TABLE "ItemTracking" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "estimatedDeliveryDays" INTEGER NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemTracking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemTracking_itemId_key" ON "ItemTracking"("itemId");

-- CreateIndex
CREATE INDEX "ItemTracking_itemId_idx" ON "ItemTracking"("itemId");
