/**
 * Process-local caches are safe for the local file-backed runtime, where one
 * process owns both reads and writes. Database-backed deployments can route a
 * mutation and the following read to different serverless instances, so mutable
 * page data must be read from the shared database instead.
 */
export function shouldUseProcessLocalMutableCache(usesDatabase: boolean) {
  return !usesDatabase;
}
