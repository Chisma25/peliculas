BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- CreateIndex
CREATE INDEX "PendingMovie_movieId_idx" ON "PendingMovie"("movieId");

-- CreateIndex
CREATE INDEX "WeeklyBatchRecord_selectedMovieId_idx" ON "WeeklyBatchRecord"("selectedMovieId");

-- CreateIndex
CREATE INDEX "WeeklyBatchItemRecord_movieId_idx" ON "WeeklyBatchItemRecord"("movieId");

-- AddForeignKey
ALTER TABLE "PendingMovie" ADD CONSTRAINT "PendingMovie_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "MovieRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchEntryRecord" ADD CONSTRAINT "WatchEntryRecord_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "MovieRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingRecord" ADD CONSTRAINT "RatingRecord_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "MovieRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingRecord" ADD CONSTRAINT "RatingRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyBatchRecord" ADD CONSTRAINT "WeeklyBatchRecord_selectedMovieId_fkey" FOREIGN KEY ("selectedMovieId") REFERENCES "MovieRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyBatchItemRecord" ADD CONSTRAINT "WeeklyBatchItemRecord_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "MovieRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
