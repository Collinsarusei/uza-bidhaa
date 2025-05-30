-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "hasShownPaymentWarning" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "isSystemMessage" BOOLEAN DEFAULT false;
