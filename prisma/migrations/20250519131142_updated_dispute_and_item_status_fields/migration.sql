-- AlterEnum
ALTER TYPE "ItemStatus" ADD VALUE 'DISPUTED';

-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "resolutionNotes" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "relatedDisputeId" TEXT;

-- CreateIndex
CREATE INDEX "Notification_relatedDisputeId_idx" ON "Notification"("relatedDisputeId");
