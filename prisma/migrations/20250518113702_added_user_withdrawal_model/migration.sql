-- CreateEnum
CREATE TYPE "UserWithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "UserWithdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" "UserWithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "paymentGateway" TEXT NOT NULL DEFAULT 'paystack',
    "paystackTransferCode" TEXT,
    "paystackRecipientCode" TEXT,

    CONSTRAINT "UserWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserWithdrawal_userId_idx" ON "UserWithdrawal"("userId");

-- CreateIndex
CREATE INDEX "UserWithdrawal_status_idx" ON "UserWithdrawal"("status");
