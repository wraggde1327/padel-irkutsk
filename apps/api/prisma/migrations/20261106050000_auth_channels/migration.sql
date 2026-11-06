-- CreateEnum
CREATE TYPE "AuthChannel" AS ENUM ('TELEGRAM', 'PHONE', 'EMAIL', 'GUEST');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "telegramId" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "authChannel" "AuthChannel" NOT NULL DEFAULT 'TELEGRAM';
ALTER TABLE "User" ADD COLUMN "profileComplete" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateTable
CREATE TABLE "AuthCode" (
    "id" TEXT NOT NULL,
    "channel" "AuthChannel" NOT NULL,
    "target" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthCode_channel_target_createdAt_idx" ON "AuthCode"("channel", "target", "createdAt");

-- Existing Telegram users already have name from TG — mark complete if they have lastName+something, else leave incomplete for phone
UPDATE "User" SET "profileComplete" = true WHERE "telegramId" IS NOT NULL AND "lastName" IS NOT NULL;
UPDATE "User" SET "profileComplete" = true WHERE "role" IN ('ADMIN', 'OWNER');
