-- DropIndex
DROP INDEX "FeeRule_isActive_minAmount_maxAmount_idx";

-- DropIndex
DROP INDEX "FeeRule_isActive_priority_idx";

-- DropIndex
DROP INDEX "FeeRule_name_key";

-- AlterTable
ALTER TABLE "FeeRule" ALTER COLUMN "minAmount" DROP NOT NULL;

-- CreateTable
CREATE TABLE "GlobalSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "defaultFeePercentage" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalSettings_pkey" PRIMARY KEY ("id")
);
