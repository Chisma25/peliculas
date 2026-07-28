export const PENDING_WRITE_EVENT = "cine:pending-write";
export const PENDING_UPDATED_EVENT = "cine:pending-updated";
export const PENDING_UPDATED_AT_KEY = "cine:pending-updated-at";
export const PENDING_REFRESHED_AT_KEY = "cine:pending-refreshed-at";

export type PendingWriteEventDetail = {
  phase: "start" | "finish";
};

export function announcePendingWrite(phase: PendingWriteEventDetail["phase"]) {
  window.dispatchEvent(new CustomEvent<PendingWriteEventDetail>(PENDING_WRITE_EVENT, { detail: { phase } }));
}

export function announcePendingUpdated() {
  const updatedAt = Date.now().toString();
  window.sessionStorage.setItem(PENDING_UPDATED_AT_KEY, updatedAt);
  window.dispatchEvent(new CustomEvent(PENDING_UPDATED_EVENT));
}
