import { appendFileSync } from "node:fs";

import { selectSuccessfulPreviewUrl } from "./lib/github-deployments.mjs";
import { parseArguments } from "./lib/database-operations.mjs";

const args = parseArguments();
const repository =
  (typeof args.repository === "string" ? args.repository : process.env.GITHUB_REPOSITORY)?.trim();
const sha = (typeof args.sha === "string" ? args.sha : process.env.GITHUB_SHA)?.trim();
const token = process.env.GITHUB_TOKEN?.trim();
const attempts = Math.max(1, Number(args.attempts ?? 30));
const delayMs = Math.max(0, Number(args["delay-ms"] ?? 10_000));

if (!repository || !sha || !token) {
  throw new Error("Faltan repository, sha o GITHUB_TOKEN para localizar el Preview.");
}

async function githubFetch(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    throw new Error(`GitHub respondió HTTP ${response.status} al consultar ${path}.`);
  }
  return response.json();
}

let previewUrl = null;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const deployments = await githubFetch(
    `/repos/${repository}/deployments?sha=${encodeURIComponent(sha)}&per_page=20`
  );
  const previewDeployments = deployments.filter(
    (deployment) => deployment.environment?.toLowerCase() === "preview"
  );
  const deploymentsWithStatuses = await Promise.all(
    previewDeployments.map(async (deployment) => ({
      deployment,
      statuses: await githubFetch(
        `/repos/${repository}/deployments/${deployment.id}/statuses?per_page=20`
      )
    }))
  );

  previewUrl = selectSuccessfulPreviewUrl(deploymentsWithStatuses);
  if (previewUrl) {
    break;
  }

  console.log(`Preview pendiente (${attempt}/${attempts}).`);
  if (attempt < attempts && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

if (!previewUrl) {
  throw new Error(`No apareció un Preview correcto para ${sha}.`);
}

console.log(`Preview listo: ${previewUrl}`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `url=${previewUrl}\n`, "utf8");
}
