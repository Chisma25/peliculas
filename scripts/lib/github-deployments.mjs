export function selectSuccessfulPreviewUrl(deploymentsWithStatuses) {
  return (
    deploymentsWithStatuses
      .filter((entry) => entry.deployment?.environment?.toLowerCase() === "preview")
      .sort(
        (left, right) =>
          new Date(right.deployment.created_at ?? 0).getTime() -
          new Date(left.deployment.created_at ?? 0).getTime()
      )
      .flatMap((entry) =>
        entry.statuses
          .filter((status) => status.state === "success" && status.environment_url)
          .sort(
            (left, right) =>
              new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime()
          )
      )[0]?.environment_url ?? null
  );
}
