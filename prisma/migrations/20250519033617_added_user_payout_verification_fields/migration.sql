-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastVerifiedBankAcc" TEXT,
ADD COLUMN     "lastVerifiedBankCode" TEXT,
ADD COLUMN     "lastVerifiedMpesa" TEXT,
ADD COLUMN     "lastVerifiedPayoutMethod" TEXT;

-- AlterTable
ALTER TABLE "UserWithdrawal" ADD COLUMN     "payoutDetailsMasked" TEXT,
ADD COLUMN     "payoutMethod" TEXT,
ADD COLUMN     "paystackTransferReference" TEXT;
