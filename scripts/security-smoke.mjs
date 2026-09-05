import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomBytes, scryptSync } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// This test always owns its local server and synthetic dataset. It cannot target a deployment.
const dataDir = mkdtempSync(join(tmpdir(), "cine-security-"));
const secret = randomBytes(32).toString("hex");
const resetCode = randomBytes(32).toString("hex");
const password = randomBytes(20).toString("hex");
const makeUser = (id, isAdmin = false) => {
  const salt = randomBytes(16).toString("hex");
  return { id, name: id, username: id, email: `${id}@example.invalid`, avatarSeed: id,
    passwordHash: `${salt}:${scryptSync(password, salt, 64).toString("hex")}`, isAdmin };
};
const users = [makeUser("member_alpha"), makeUser("member_beta"), makeUser("admin_control", true)];
const movie = { id: "movie_security", slug: "security-film", title: "Security Film", year: 2025,
  synopsis: "Synthetic film for security regression tests.", durationMinutes: 90, genres: ["Drama"],
  director: "Test Director", cast: [], language: "Español", country: "España",
  externalRating: { source: "TMDb", value: "80%" }, metadataVersion: 999 };
writeFileSync(join(dataDir, "runtime-state.json"), JSON.stringify({ users,
  group: { id: "group_cine_club", name: "Cine club", memberIds: users.map(u => u.id), accentColor: "#fff" },
  movies: [movie], watchEntries: [{ id: "watch_security", movieId: movie.id, groupId: "group_cine_club", watchedOn: "2026-01-01" }],
  ratings: users.map((u, i) => ({ id: `rating_${i}`, userId: u.id, movieId: movie.id, score: 8 })),
  pendingMovieIds: [], weeklyBatches: [], activity: [] }));

const port = await new Promise((resolvePort, reject) => {
  const listener = createServer();
  listener.on("error", reject);
  listener.listen(0, "127.0.0.1", () => { const port = listener.address().port; listener.close(() => resolvePort(port)); });
});
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: "production", APP_ENV: "development", DATABASE_URL: "", DIRECT_URL: "",
  DATABASE_ENVIRONMENT: "development", APP_DATA_DIR: dataDir, SESSION_SECRET: secret, ADMIN_RESET_CODE: resetCode,
  TMDB_API_KEY: "", VERCEL_ENV: "", VERCEL: "", ALLOW_REMOTE_DATABASE_IN_DEVELOPMENT: "false" };
let output = "";
const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)],
  { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", chunk => { output += chunk; });
server.stderr.on("data", chunk => { output += chunk; });
const read = (path, cookie, extra = {}) => fetch(base + path, { redirect: "manual", headers: { ...(cookie ? { cookie } : {}), ...extra } });
async function post(path, fields, cookie) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return fetch(base + path, { method: "POST", body, redirect: "manual", headers: cookie ? { cookie } : {} });
}
const responseCookie = response => response.headers.get("set-cookie")?.split(";")[0];
async function login(username, currentPassword = password) {
  const response = await post("/api/auth/login", { username, password: currentPassword });
  assert.equal(response.status, 200, "login succeeds");
  const cookie = responseCookie(response);
  assert.ok(cookie);
  return cookie;
}
async function revoked(cookie) {
  for (const path of ["/grupo", "/grupo/member-beta", "/grupo/member.beta", "/peliculas/security-film"]) {
    const response = await read(path, cookie);
    assert.equal(response.status, 303, `revoked cookie cannot read ${path}`);
    assert.ok(response.headers.get("location").includes("/login"));
  }
  assert.equal((await read("/api/history/list", cookie)).status, 401);
  assert.equal((await post("/api/profile/update", { name: "Unauthorized", username: "member_alpha" }, cookie)).status, 401);
}

try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { if ((await read("/api/version")).ok) { ready = true; break; } } catch { /* server starting */ }
    if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
    await delay(250);
  }
  assert.ok(ready, `Local server started: ${output}`);
  const alpha = await login("member_alpha");
  const beta = await login("member_beta");
  const admin = await login("admin_control");
  for (const path of ["/grupo", "/perfil", "/grupo/member-beta", "/peliculas/security-film"]) {
    for (const [cookie, extra] of [[alpha, {}], [alpha, { RSC: "1" }], [admin, {}], [admin, { RSC: "1" }]]) {
      const response = await read(path, cookie, extra);
      assert.equal(response.status, 200, `page available: ${path}`);
      const body = await response.text();
      assert.ok(!body.includes("passwordHash"), `no credential property in ${path}`);
      for (const user of users) assert.ok(!body.includes(user.passwordHash), `no hash in ${path}`);
    }
  }
  for (const name of ["Isma", "ISMA", "Ísma"]) {
    assert.equal((await post("/api/profile/update", { name, username: "member_alpha" }, alpha)).status, 200);
    assert.equal((await post("/api/admin/users/update", { userId: "member_beta", username: "member_beta" }, alpha)).status, 403);
  }
  const nextPassword = randomBytes(20).toString("hex");
  const change = await post("/api/profile/update", { name: "Alpha", username: "member_alpha", password: nextPassword }, alpha);
  assert.equal(change.status, 200);
  const renewed = responseCookie(change);
  assert.ok(renewed);
  await revoked(alpha);
  assert.equal((await read("/grupo", renewed)).status, 200, "current browser gets a new valid session");
  assert.equal((await post("/api/auth/login", { username: "member_alpha", password })).status, 401);
  await login("member_alpha", nextPassword);

  const adminPassword = randomBytes(20).toString("hex");
  assert.equal((await post("/api/admin/users/update", { userId: "member_beta", username: "member_beta", password: adminPassword }, admin)).status, 200);
  await revoked(beta);
  const newBeta = await login("member_beta", adminPassword);
  const emergencyPassword = randomBytes(20).toString("hex");
  assert.equal((await post("/api/auth/reset-credentials", { identifier: "member_beta", username: "member_beta", password: emergencyPassword, adminCode: resetCode })).status, 200);
  await revoked(newBeta);
  await login("member_beta", emergencyPassword);

  const legacyPayload = `member_alpha.${Date.now() + 60000}`;
  const legacy = `cine.session=${legacyPayload}.${createHmac("sha256", secret).update(legacyPayload).digest("hex")}`;
  await revoked(legacy);
  const state = JSON.parse(readFileSync(join(dataDir, "runtime-state.json"), "utf8"));
  assert.equal(state.users.find(u => u.id === "member_alpha").isAdmin, false);
  assert.equal(state.users.find(u => u.id === "admin_control").isAdmin, true);
  console.log("Security HTTP checks passed: roles, HTML/RSC privacy, password/admin/emergency revocation, protected pages and API.");
} catch (error) {
  console.error(output);
  throw error;
} finally {
  server.kill();
  await new Promise(resolveExit => { if (server.exitCode !== null) resolveExit(); else server.once("exit", resolveExit); });
  // Kept in the OS temporary directory for failure diagnostics; never touches workspace or remote data.
}
