/*
  Warnings:

  - A unique constraint covering the columns `[activeDisputeId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'DISPUTED';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "activeDisputeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_activeDisputeId_key" ON "Payment"("activeDisputeId");
