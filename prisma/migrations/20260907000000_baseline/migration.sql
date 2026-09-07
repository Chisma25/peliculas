-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AppSnapshot" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmdbCacheEntry" (
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TmdbCacheEntry_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "UserRecord" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatarSeed" TEXT,
    "avatarUrl" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovieRecord" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovieRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingMovie" (
    "groupId" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingMovie_pkey" PRIMARY KEY ("groupId","movieId")
);

-- CreateTable
CREATE TABLE "WatchEntryRecord" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "watchedOn" TIMESTAMP(3),
    "selectedForWeek" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchEntryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingRecord" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "watchedOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyBatchRecord" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "selectedMovieId" TEXT,

    CONSTRAINT "WeeklyBatchRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyBatchItemRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL,
    "summary" TEXT NOT NULL,
    "reasons" JSONB NOT NULL,
    "metrics" JSONB,

    CONSTRAINT "WeeklyBatchItemRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TmdbCacheEntry_kind_expiresAt_idx" ON "TmdbCacheEntry"("kind", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserRecord_username_key" ON "UserRecord"("username");

-- CreateIndex
CREATE INDEX "UserRecord_username_idx" ON "UserRecord"("username");

-- CreateIndex
CREATE UNIQUE INDEX "MovieRecord_slug_key" ON "MovieRecord"("slug");

-- CreateIndex
CREATE INDEX "MovieRecord_slug_idx" ON "MovieRecord"("slug");

-- CreateIndex
CREATE INDEX "PendingMovie_groupId_addedAt_idx" ON "PendingMovie"("groupId", "addedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchEntryRecord_movieId_key" ON "WatchEntryRecord"("movieId");

-- CreateIndex
CREATE INDEX "WatchEntryRecord_groupId_watchedOn_idx" ON "WatchEntryRecord"("groupId", "watchedOn");

-- CreateIndex
CREATE INDEX "RatingRecord_movieId_idx" ON "RatingRecord"("movieId");

-- CreateIndex
CREATE INDEX "RatingRecord_userId_idx" ON "RatingRecord"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RatingRecord_movieId_userId_key" ON "RatingRecord"("movieId", "userId");

-- CreateIndex
CREATE INDEX "WeeklyBatchRecord_groupId_createdAt_idx" ON "WeeklyBatchRecord"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "WeeklyBatchItemRecord_batchId_position_idx" ON "WeeklyBatchItemRecord"("batchId", "position");

-- AddForeignKey
ALTER TABLE "WeeklyBatchItemRecord" ADD CONSTRAINT "WeeklyBatchItemRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WeeklyBatchRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
