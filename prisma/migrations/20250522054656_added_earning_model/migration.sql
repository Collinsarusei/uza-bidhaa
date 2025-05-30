-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('AVAILABLE');

-- CreateTable
CREATE TABLE "Earning" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "relatedPaymentId" TEXT NOT NULL,
    "relatedItemId" TEXT NOT NULL,
    "itemTitleSnapshot" TEXT,
    "status" "EarningStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Earning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Earning_relatedPaymentId_key" ON "Earning"("relatedPaymentId");

-- CreateIndex
CREATE INDEX "Earning_userId_createdAt_idx" ON "Earning"("userId", "createdAt");
