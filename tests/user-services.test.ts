import { afterEach, expect, it, vi } from "vitest";
import type { AppState, Movie, User, UserRating } from "@/lib/types";
import { seedState } from "@/lib/demo-data";
import { createAuthenticationService } from "@/lib/users/authentication";
import { buildProfileFromRatings, createProfileReader } from "@/lib/users/profiles";
import { ensureUserCredentials, mapUserRecordsToStateUsers } from "@/lib/users/records";
import { createSessionToken } from "@/lib/session";
import { hashPassword } from "@/lib/user-input";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());

function user(): User {
  return { id: "test_user", name: "Álpha", username: "alpha_user", email: "test@example.invalid", avatarSeed: "alpha",
    passwordHash: hashPassword("Original-password-123"), isAdmin: false };
}

it("reads current credentials for login and token checks after a password change", async () => {
  vi.stubEnv("SESSION_SECRET", "synthetic-session-secret-for-user-service-tests");
  const currentUser = user();
  const authentication = createAuthenticationService(async () => [structuredClone(currentUser)]);
  const token = await createSessionToken(currentUser.id, currentUser.passwordHash);
  expect((await authentication.authenticateUser("ALPHA", "Original-password-123"))?.id).toBe(currentUser.id);
  expect((await authentication.getSessionUserFromToken(token))?.id).toBe(currentUser.id);
  currentUser.passwordHash = hashPassword("Changed-password-456");
  expect(await authentication.authenticateUser("ALPHA", "Original-password-123")).toBeNull();
  expect(await authentication.getSessionUserFromToken(token)).toBeNull();
  expect((await authentication.authenticateUser("alpha_user", "Changed-password-456"))?.id).toBe(currentUser.id);
  const newToken = await createSessionToken(currentUser.id, currentUser.passwordHash);
  expect((await authentication.getSessionUserFromToken(newToken))?.id).toBe(currentUser.id);
});

it("keeps credential and database failures distinct from an invalid session", async () => {
  vi.stubEnv("SESSION_SECRET", "synthetic-session-secret-for-user-service-tests");
  const currentUser = user();
  const token = await createSessionToken(currentUser.id, currentUser.passwordHash);
  const authentication = createAuthenticationService(async () => { throw new Error("Database unavailable"); });
  expect(await authentication.getSessionUserFromToken("invalid")).toBeNull();
  await expect(authentication.getSessionUserFromToken(token)).rejects.toThrow("Database unavailable");
  await expect(authentication.authenticateUser("alpha_user", "Original-password-123")).rejects.toThrow("Database unavailable");
});

it("preserves a raw avatar for mutations while using a delivery URL for reads", () => {
  const avatarUrl = "data:image/png;base64,YQ==";
  const record = { ...user(), avatarUrl };
  expect(mapUserRecordsToStateUsers([record], { useDeliveryUrls: false })[0].avatarUrl).toBe(avatarUrl);
  expect(mapUserRecordsToStateUsers([record])[0].avatarUrl).toMatch(/^\/api\/users\/test_user\/avatar\?v=/);
  expect(ensureUserCredentials({ ...record, name: "Isma", username: "Isma", passwordHash: "", isAdmin: undefined }))
    .toMatchObject({ passwordHash: "", isAdmin: false });
});

function profileFixture() {
  const state = structuredClone(seedState);
  state.users = [user()];
  state.movies = [2020, 2025, 2021].map((year, index) => ({ ...state.movies[0], id: `film_${index}`, year }));
  state.ratings = [8.25, 8.25, 0].map((score, index) => ({
    id: `rating_${index}`, userId: state.users[0].id, movieId: state.movies[index].id, score
  }));
  return state;
}

function indexes(state: AppState) {
  const ratingsByUserId = new Map<string, UserRating[]>();
  for (const rating of state.ratings) ratingsByUserId.set(rating.userId, [...(ratingsByUserId.get(rating.userId) ?? []), rating]);
  return { ratingsByUserId, moviesById: new Map<string, Movie>(state.movies.map(movie => [movie.id, movie])) };
}

it("preserves profile rankings, zero scores, quarter-point bins and summary between read paths", () => {
  const state = profileFixture();
  const reader = createProfileReader({ getStateIndexes: indexes, findUserById: (state, id) => state.users.find(user => user.id === id) ?? null });
  const local = reader.buildProfileFromState(state, state.users[0].id)!;
  const database = buildProfileFromRatings(state.users[0], state.ratings, indexes(state).moviesById);
  expect(local).toEqual(database);
  expect(local).toMatchObject({ ratingsCount: 3, averageScore: 5.5, bestScore: 8.25 });
  expect(local.topThree.map(rating => rating.movieId)).toEqual(["film_1", "film_0", "film_2"]);
  expect(local.bottomThree.map(rating => rating.movieId)).toEqual(["film_2", "film_1", "film_0"]);
  expect(local.distribution.find(bin => bin.value === 0)?.count).toBe(1);
  expect(local.distribution.find(bin => bin.value === 8.5)).toMatchObject({ count: 2, ratio: 1 });
});

it("invalidates all profile calculations when ratings change and handles an empty profile", () => {
  const state = profileFixture();
  const reader = createProfileReader({ getStateIndexes: indexes, findUserById: (state, id) => state.users.find(user => user.id === id) ?? null });
  expect(reader.buildProfileFromState(state, "missing")).toBeNull();
  reader.buildProfileFromState(state, state.users[0].id);
  state.ratings = [];
  reader.invalidateProfileCaches(state);
  const profile = reader.buildProfileFromState(state, state.users[0].id)!;
  expect(profile).toMatchObject({ ratingsCount: 0, averageScore: 0, bestScore: 0, topThree: [], bottomThree: [] });
  expect(profile.distribution.every(bin => bin.count === 0 && bin.ratio === 0)).toBe(true);
});
