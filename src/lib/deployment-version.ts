export type DeploymentVersion = {
  commitSha: string;
  shortCommitSha: string;
  commitRef: string;
  environment: string;
  deploymentUrl: string | null;
};

type DeploymentEnvironment = Record<string, string | undefined>;

function readValue(environment: DeploymentEnvironment, ...keys: string[]) {
  for (const key of keys) {
    const value = environment[key]?.trim();
    if (value) return value;
  }

  return null;
}

export function getDeploymentVersion(
  environment: DeploymentEnvironment = process.env
): DeploymentVersion {
  const commitSha =
    readValue(environment, "VERCEL_GIT_COMMIT_SHA", "GITHUB_SHA", "COMMIT_SHA") ?? "local";
  const commitRef =
    readValue(environment, "VERCEL_GIT_COMMIT_REF", "GITHUB_REF_NAME", "COMMIT_REF") ?? "local";
  const deploymentEnvironment =
    readValue(environment, "VERCEL_ENV", "APP_ENV", "NODE_ENV") ?? "unknown";
  const deploymentUrl = readValue(environment, "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL");

  return {
    commitSha,
    shortCommitSha: commitSha === "local" ? commitSha : commitSha.slice(0, 7),
    commitRef,
    environment: deploymentEnvironment,
    deploymentUrl: deploymentUrl ? `https://${deploymentUrl.replace(/^https?:\/\//, "")}` : null
  };
}
