import { expect, test } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

test("login stays focused and hides authenticated navigation", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ir al dashboard de Cine Semanal" })).toBeVisible();
});

test.describe("authenticated Preview smoke tests", () => {
  test.skip(!username || !password, "Set E2E_USERNAME and E2E_PASSWORD to run authenticated flows.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /Usuario/ }).fill(username ?? "");
    await page.getByRole("textbox", { name: /Contraseña/ }).fill(password ?? "");
    await Promise.all([page.waitForURL("**/"), page.getByRole("button", { name: "Entrar" }).click()]);
  });

  test("loads protected pages and keeps the group HTML payload lean", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Green Book" })).toBeVisible();

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
    const headingBox = await page.getByRole("heading", { name: "Green Book" }).boundingBox();

    expect(headerBox?.height ?? 999).toBeLessThan(100);
    expect(headingBox?.y ?? 0).toBeGreaterThan(headerBox?.y ? headerBox.y + headerBox.height : headerBox?.height ?? 0);
  });
});
