/*
  Warnings:

  - You are about to drop the column `destinationAccountName` on the `AdminFeeWithdrawal` table. All the data in the column will be lost.
  - You are about to drop the column `destinationAccountNumber` on the `AdminFeeWithdrawal` table. All the data in the column will be lost.
  - You are about to drop the column `destinationBankCode` on the `AdminFeeWithdrawal` table. All the data in the column will be lost.
  - You are about to drop the column `destinationBankName` on the `AdminFeeWithdrawal` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[relatedPaymentId]` on the table `PlatformFee` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "PlatformFee_relatedPaymentId_idx";

-- AlterTable
ALTER TABLE "AdminFeeWithdrawal" DROP COLUMN "destinationAccountName",
DROP COLUMN "destinationAccountNumber",
DROP COLUMN "destinationBankCode",
DROP COLUMN "destinationBankName",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "paystackTransferCode" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "relatedPaymentId" TEXT,
ADD COLUMN     "relatedWithdrawalId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "failureReason" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFee_relatedPaymentId_key" ON "PlatformFee"("relatedPaymentId");
