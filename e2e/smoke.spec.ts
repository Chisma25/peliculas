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
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ir al dashboard de Cine Semanal" })).toBeVisible();
});

test.describe("authenticated Preview smoke tests", () => {
  test.skip(
    !sessionUserId && (!username || !password),
    "Set E2E_SESSION_USER_ID or E2E_USERNAME and E2E_PASSWORD to run authenticated flows."
  );

  test.beforeEach(async ({ page, baseURL }) => {
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

    await page.goto("/login");
    await page.getByRole("textbox", { name: /Usuario/ }).fill(username ?? "");
    await page.getByRole("textbox", { name: /Contraseña/ }).fill(password ?? "");
    await Promise.all([page.waitForURL("**/"), page.getByRole("button", { name: "Entrar" }).click()]);
  });

  test("loads protected pages and keeps the group HTML payload lean", async ({ page }) => {
    await expect(page.locator("main h1").first()).toBeVisible();

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

  test("uses compact mobile navigation without covering the main heading", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile-only layout assertion.");
    await page.goto("/");

    const headerBox = await page.locator("header").boundingBox();
    const headingBox = await page.locator("main h1").first().boundingBox();

    expect(headerBox?.height ?? 999).toBeLessThan(100);
    expect(headingBox?.y ?? 0).toBeGreaterThan(headerBox?.y ? headerBox.y + headerBox.height : headerBox?.height ?? 0);
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

  test("shows an updated rating immediately on the movie detail page", async ({ page }) => {
    test.skip(!ratingMovieId || !ratingMovieSlug, "Set the dedicated E2E rating movie id and slug to run this mutation.");

    await page.goto(`/peliculas/${ratingMovieSlug}`);
    await page.getByRole("button", { name: "Editar mi valoraciÃ³n" }).click();

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
      await page.getByRole("button", { name: "Actualizar valoraciÃ³n" }).click();

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
