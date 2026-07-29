import { describe, expect, it } from "vitest";

import { selectSuccessfulPreviewUrl } from "../scripts/lib/github-deployments.mjs";

describe("selectSuccessfulPreviewUrl", () => {
  it("selects the newest successful Preview URL", () => {
    const url = selectSuccessfulPreviewUrl([
      {
        deployment: { environment: "Preview", created_at: "2026-07-28T12:00:00Z" },
        statuses: [
          {
            state: "success",
            environment_url: "https://old-preview.example",
            created_at: "2026-07-28T12:01:00Z"
          }
        ]
      },
      {
        deployment: { environment: "Preview", created_at: "2026-07-29T12:00:00Z" },
        statuses: [
          { state: "pending", environment_url: null, created_at: "2026-07-29T12:00:30Z" },
          {
            state: "success",
            environment_url: "https://current-preview.example",
            created_at: "2026-07-29T12:01:00Z"
          }
        ]
      }
    ]);

    expect(url).toBe("https://current-preview.example");
  });

  it("ignores production and incomplete deployments", () => {
    expect(
      selectSuccessfulPreviewUrl([
        {
          deployment: { environment: "Production", created_at: "2026-07-29T12:00:00Z" },
          statuses: [
            {
              state: "success",
              environment_url: "https://production.example",
              created_at: "2026-07-29T12:01:00Z"
            }
          ]
        },
        {
          deployment: { environment: "Preview", created_at: "2026-07-29T12:00:00Z" },
          statuses: [{ state: "pending", environment_url: null, created_at: "2026-07-29T12:00:30Z" }]
        }
      ])
    ).toBeNull();
  });
});
