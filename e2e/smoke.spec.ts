import { createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;
const sessionUserId = process.env.E2E_SESSION_USER_ID;
const ratingMovieId = process.env.E2E_RATING_MOVIE_ID;
const ratingMovieSlug = process.env.E2E_RATING_MOVIE_SLUG;

function createDevelopmentSessionToken(userId: string) {
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `${encodeURIComponent(userId)}.${expiresAt}`;
  const secret = process.env.SESSION_SECRET?.trim() || "cine-semanal-dev-session-secret";
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

test("login stays focused and hides authenticated navigation", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ir al dashboard de Cine Semanal" })).toBeVisible();
});

test("exposes a public, non-cached deployment identity", async ({ request }) => {
  const response = await request.get("/api/version");
  const payload = await response.json();

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(payload).toMatchObject({
    service: "cine-semanal",
    status: "ok"
  });
  expect(payload.commitSha).toBeTruthy();
  expect(payload.commitRef).toBeTruthy();
  expect(payload.environment).toBeTruthy();
});

test.describe("authenticated Preview smoke tests", () => {
  test.skip(
    !sessionUserId && (!username || !password),
    "Set E2E_SESSION_USER_ID or E2E_USERNAME and E2E_PASSWORD to run authenticated flows."
  );

  test.beforeEach(async ({ page, baseURL }) => {
    if (username && password) {
      await page.goto("/");
      return;
    }

    if (sessionUserId) {
      await page.context().addCookies([
        {
          name: "cine.session",
          value: createDevelopmentSessionToken(sessionUserId),
          url: new URL("/", baseURL ?? "http://127.0.0.1:3000").origin
        }
      ]);
      await page.goto("/");
      return;
    }

    throw new Error("No hay un método de autenticación E2E configurado.");
  });

  test("loads protected pages and keeps the group HTML payload lean", async ({ page }) => {
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(page.getByText("Últimos movimientos")).toHaveCount(0);

    const response = await page.goto("/grupo");
    expect(response?.status()).toBe(200);
    const html = (await response?.text()) ?? "";

    expect(html).not.toContain("data:image/");
    expect(Buffer.byteLength(html, "utf8")).toBeLessThan(250_000);
    await expect(page.getByRole("heading", { name: "Cine club" })).toBeVisible();
  });

  test("deduplicates TMDb search results", async ({ page }) => {
    await page.goto("/explorar");
    await page.getByRole("searchbox", { name: "Buscar por título" }).fill("Matrix");

    const matrixLink = page.locator('a[href="https://www.themoviedb.org/movie/603"]');
    await expect(matrixLink).toHaveCount(1);
    await expect(page.getByText("resultados encontrados.")).toBeVisible();
  });

  test("prioritizes canonical movies across translated and reused titles", async ({ page }) => {
    await page.goto("/explorar");
    const search = page.getByRole("searchbox", { name: "Buscar por título" });

    await search.fill("Perfect Days");
    await expect(page.getByText("resultados encontrados.")).toBeVisible();
    await expect(page.locator(".explorer-card").first().getByText("Días perfectos", { exact: true })).toBeVisible();

    await search.fill("Fight Club");
    await expect(page.locator('a[href="https://www.themoviedb.org/movie/550"]')).toBeVisible();
    await expect(page.locator(".explorer-card").first().getByText("El club de la lucha", { exact: true })).toBeVisible();
  });

  test("shows TMDb original language instead of the first spoken language", async ({ page }) => {
    await page.goto("/peliculas/oppenheimer");

    const languageCard = page.locator("article").filter({ hasText: "Idioma original" });
    await expect(languageCard.getByText("Inglés", { exact: true })).toBeVisible();
  });

  test("uses compact mobile navigation without covering the main heading", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile-only layout assertion.");
    await page.goto("/");

    const headerBox = await page.locator("header").boundingBox();
    const headingBox = await page.locator("main h1").first().boundingBox();

    expect(headerBox?.height ?? 999).toBeLessThan(100);
    expect(headingBox?.y ?? 0).toBeGreaterThan(headerBox?.y ? headerBox.y + headerBox.height : headerBox?.height ?? 0);
  });

  test("keeps the tablet header compact without covering group content", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop project owns the tablet viewport assertion.");
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/grupo");

    const headerBox = await page.locator("header").boundingBox();
    const brandBox = await page.getByRole("link", { name: "Ir al dashboard de Cine Semanal" }).boundingBox();
    const navigationBox = await page.getByRole("navigation", { name: "Principal" }).boundingBox();
    const profileBox = await page.locator(".user-chip").boundingBox();
    const headingBox = await page.getByRole("heading", { name: "Cine club" }).boundingBox();

    expect(headerBox?.height ?? 999).toBeLessThan(100);
    expect((brandBox?.x ?? 999) + (brandBox?.width ?? 999)).toBeLessThan(navigationBox?.x ?? 0);
    expect((navigationBox?.x ?? 999) + (navigationBox?.width ?? 999)).toBeLessThan(profileBox?.x ?? 0);
    expect(headingBox?.y ?? 0).toBeGreaterThan(headerBox?.y ? headerBox.y + headerBox.height : headerBox?.height ?? 0);
  });

  test("uses native lazy-loaded images for poster collections", async ({ page }) => {
    await page.goto("/pendientes");

    const posters = page.locator(".pending-radar-poster img.poster-image, .pending-movie-poster img.poster-image");
    const posterCount = await posters.count();
    test.skip(posterCount === 0, "The current environment has no poster artwork.");

    await expect(posters.first()).toHaveAttribute("loading", "lazy");
    await expect(posters.first()).toHaveAttribute("decoding", "async");

    const cssBackgroundPosters = await page.locator(
      '.pending-radar-poster[style*="background-image"], .pending-movie-poster[style*="background-image"]'
    ).count();
    expect(cssBackgroundPosters).toBe(0);
  });

  test("keeps the main flows inside the viewport", async ({ page }) => {
    for (const path of ["/", "/vistas", "/explorar", "/pendientes"]) {
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        contentWidth: document.documentElement.scrollWidth
      }));

      expect(dimensions.contentWidth, `${path} should not overflow horizontally`).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    }
  });

  test("keeps keyboard focus inside the rating dialog and restores it on close", async ({ page }) => {
    await page.goto("/vistas");
    await page.locator('a[href^="/peliculas/"]').first().click();

    const trigger = page.getByRole("button", { name: /Editar mi valoración|Valorar película/ });
    await trigger.click();

    const dialog = page.getByRole("dialog");
    const scoreInput = page.getByRole("spinbutton", { name: "Nota" });
    await expect(dialog).toBeVisible();
    await expect(scoreInput).toBeFocused();

    await scoreInput.fill("7.3");
    await page.getByRole("button", { name: /Actualizar valoración|Guardar valoración/ }).click();
    await expect(dialog.getByRole("alert")).toContainText("0,25");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("waits for a pending write before opening the pending list", async ({ page }) => {
    await page.route("**/api/movies/search?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            {
              id: "tmdb_157336",
              slug: "interstellar",
              title: "Interstellar",
              year: 2014,
              synopsis: "Un grupo de exploradores viaja más allá de nuestra galaxia.",
              durationMinutes: 169,
              genres: ["Ciencia ficción"],
              director: "Christopher Nolan",
              cast: [],
              language: "EN",
              country: "Estados Unidos",
              posterUrl: "/icon.svg",
              externalRating: { source: "TMDb", value: "84%" },
              sourceIds: { tmdb: "157336" }
            }
          ]
        })
      });
    });
    await page.route("**/api/pending/add", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "added", message: "Película añadida a pendientes." })
      });
    });

    await page.goto("/explorar");
    await page.getByRole("searchbox", { name: "Buscar por título" }).fill("Interstellar");
    const addButton = page.getByRole("button", { name: "Añadir", exact: true });
    await expect(addButton).toBeVisible();
    await addButton.click();
    await expect(page.getByRole("button", { name: "Añadiendo..." })).toBeVisible();

    await page.getByRole("link", { name: "Pendientes" }).click();
    await expect(page).toHaveURL(/\/explorar$/);
    await expect(page).toHaveURL(/\/pendientes$/, { timeout: 5_000 });
  });

  test("shows the existing collection state in explorer results", async ({ page }) => {
    await page.route("**/api/movies/search?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            {
              id: "movie_matrix",
              slug: "matrix",
              title: "Matrix",
              year: 1999,
              synopsis: "Neo descubre que la realidad que conoce es una simulación.",
              durationMinutes: 136,
              genres: ["Acción", "Ciencia ficción"],
              director: "Lana Wachowski",
              cast: [],
              language: "EN",
              country: "Estados Unidos",
              posterUrl: "/icon.svg",
              externalRating: { source: "TMDb", value: "82%" },
              sourceIds: { tmdb: "603" },
              collectionStatus: "already_pending"
            }
          ]
        })
      });
    });

    await page.goto("/explorar");
    await page.getByRole("searchbox", { name: "Buscar por título" }).fill("Matrix");

    const existingButton = page.getByRole("button", { name: "Ya en pendientes" });
    await expect(existingButton).toBeVisible();
    await expect(existingButton).toBeDisabled();
  });

  test("keeps weekly recommendations concise without restricting the pending archive", async ({ page }) => {
    await page.goto("/pendientes");

    const radar = page.getByRole("region", { name: "Recomendaciones semanales" });
    const radarCount = await radar.count();
    test.skip(radarCount === 0, "The current environment has no weekly radar.");

    await expect(radar.getByRole("heading", { name: "Recomendaciones" })).toBeVisible();
    await expect(radar.getByText("#1", { exact: true }).first()).toBeVisible();
    await expect(radar.locator(".pending-radar-position-label")).toHaveCount(0);
    await expect(radar.locator(".pending-radar-reason")).toHaveCount(0);
    await expect(radar.locator(".pending-radar-detail-link")).toHaveCount(0);
    await expect(radar.locator(".pending-radar-fit")).toHaveCount(0);
    await expect(radar.locator(".pending-radar-metrics")).toHaveCount(0);

    const archive = page.getByRole("region", { name: "Archivo de pendientes" });
    const firstCard = archive.locator(".pending-movie-card").first();
    const removeButton = firstCard.getByRole("button", { name: "Quitar", exact: true });
    const chooseButton = firstCard.getByRole("button", { name: /^(Elegir|Elegida)$/ });
    await expect(chooseButton).toBeVisible();

    const [removeBox, chooseBox] = await Promise.all([removeButton.boundingBox(), chooseButton.boundingBox()]);
    expect(removeBox).not.toBeNull();
    expect(chooseBox).not.toBeNull();
    expect(Math.abs((removeBox?.width ?? 0) - (chooseBox?.width ?? 0))).toBeLessThan(2);
    expect(Math.abs((removeBox?.height ?? 0) - (chooseBox?.height ?? 0))).toBeLessThan(2);
  });

  test("rejects a manipulated weekly selection without changing pending choices", async ({ page }) => {
    await page.goto("/pendientes");

    const batchInputs = page.locator(
      'form[action="/api/weekly-recommendations/select"] input[name="batchId"]'
    );
    const batchCount = await batchInputs.count();
    test.skip(batchCount === 0, "The current environment has no weekly batch.");

    const batchId = await batchInputs.first().inputValue();
    const response = await page.request.post("/api/weekly-recommendations/select", {
      multipart: {
        batchId,
        movieId: "movie_not_in_batch_or_pending"
      },
      maxRedirects: 0
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload.error).toMatch(/No se encontró|Pendientes/);
  });

  test("shows an updated rating immediately on the movie detail page", async ({ page }) => {
    test.skip(!ratingMovieId || !ratingMovieSlug, "Set the dedicated E2E rating movie id and slug to run this mutation.");

    await page.goto(`/peliculas/${ratingMovieSlug}`);
    await page.getByRole("button", { name: "Editar mi valoración" }).click();

    const scoreInput = page.getByRole("spinbutton", { name: /Nota/ });
    const commentInput = page.getByRole("textbox", { name: "Comentario opcional" });
    const initialScore = Number.parseFloat(await scoreInput.inputValue());
    const initialComment = await commentInput.inputValue();
    const nextScore = initialScore >= 9.75 ? initialScore - 0.25 : initialScore + 0.25;
    const expectedLabel = new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: nextScore % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 2
    }).format(nextScore);

    try {
      await scoreInput.fill(String(nextScore));
      await page.getByRole("button", { name: "Actualizar valoración" }).click();

      const ownRating = page.locator("article").filter({ hasText: `@${username}` });
      await expect(ownRating.getByText(expectedLabel, { exact: true })).toBeVisible();
    } finally {
      const restoreResponse = await page.request.post("/api/ratings/create-or-update", {
        multipart: {
          movieId: ratingMovieId ?? "",
          score: String(initialScore),
          comment: initialComment
        }
      });
      expect(restoreResponse.ok()).toBe(true);
    }
  });
});
