-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT,
    "placeholder" TEXT,
    "content" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OptionSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "assignmentType" TEXT NOT NULL,
    "autoCollections" TEXT,
    "autoTags" TEXT,
    "autoVendor" TEXT,
    "fields" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OptionSetAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionSetId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    CONSTRAINT "OptionSetAssignment_optionSetId_fkey" FOREIGN KEY ("optionSetId") REFERENCES "OptionSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME,
    "nextRetryAt" DATETIME,
    "errorMessage" TEXT,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "OptionSet_status_idx" ON "OptionSet"("status");

-- CreateIndex
CREATE INDEX "OptionSet_assignmentType_idx" ON "OptionSet"("assignmentType");

-- CreateIndex
CREATE INDEX "OptionSetAssignment_productId_idx" ON "OptionSetAssignment"("productId");

-- CreateIndex
CREATE INDEX "OptionSetAssignment_optionSetId_idx" ON "OptionSetAssignment"("optionSetId");

-- CreateIndex
CREATE UNIQUE INDEX "OptionSetAssignment_optionSetId_productId_key" ON "OptionSetAssignment"("optionSetId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncLog_orderId_key" ON "SyncLog"("orderId");

-- CreateIndex
CREATE INDEX "SyncLog_status_idx" ON "SyncLog"("status");

-- CreateIndex
CREATE INDEX "SyncLog_orderId_idx" ON "SyncLog"("orderId");
