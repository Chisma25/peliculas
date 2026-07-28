const QUARTER_EPSILON = 1e-9;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  return [...duplicates];
}

function validDate(value) {
  if (value === null || value === undefined || value === "") return true;
  const parsed = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function movieData(record) {
  return isRecord(record?.data) ? record.data : {};
}

function hasUsefulGenres(data) {
  return (
    Array.isArray(data.genres) &&
    data.genres.some(
      (genre) =>
        typeof genre === "string" &&
        genre.trim().length > 0 &&
        !genre.trim().toLowerCase().includes("pendiente")
    )
  );
}

function hasUsefulExternalRating(data) {
  const rating = isRecord(data.externalRating) ? data.externalRating : {};
  const numericValue = Number.parseFloat(String(rating.value ?? "").replace(",", "."));
  return typeof rating.source === "string" && rating.source.trim().length > 0 && numericValue > 0;
}

export function analyzeDatabaseIntegrity(input) {
  const tables = {
    appSnapshots: input?.appSnapshots ?? [],
    users: input?.users ?? [],
    movies: input?.movies ?? [],
    pendingMovies: input?.pendingMovies ?? [],
    watchEntries: input?.watchEntries ?? [],
    ratings: input?.ratings ?? [],
    weeklyBatches: input?.weeklyBatches ?? [],
    weeklyBatchItems: input?.weeklyBatchItems ?? [],
    tmdbCacheEntries: input?.tmdbCacheEntries ?? []
  };
  const findings = [];

  const addFinding = (severity, code, message, references = {}) => {
    findings.push({ severity, code, message, references });
  };

  const usersById = new Map(tables.users.map((entry) => [entry.id, entry]));
  const moviesById = new Map(tables.movies.map((entry) => [entry.id, entry]));
  const batchesById = new Map(tables.weeklyBatches.map((entry) => [entry.id, entry]));
  const watchedKeys = new Set(
    tables.watchEntries.map((entry) => `${entry.groupId}:${entry.movieId}`)
  );

  const identityChecks = [
    ["USER_ID_DUPLICATE", "usuarios", tables.users.map((entry) => entry.id)],
    ["USER_USERNAME_DUPLICATE", "nombres de usuario", tables.users.map((entry) => entry.username)],
    ["MOVIE_ID_DUPLICATE", "películas", tables.movies.map((entry) => entry.id)],
    ["MOVIE_SLUG_DUPLICATE", "slugs de películas", tables.movies.map((entry) => entry.slug)],
    ["WATCH_ID_DUPLICATE", "registros de vistas", tables.watchEntries.map((entry) => entry.id)],
    ["WATCH_MOVIE_DUPLICATE", "películas vistas", tables.watchEntries.map((entry) => entry.movieId)],
    ["RATING_ID_DUPLICATE", "valoraciones", tables.ratings.map((entry) => entry.id)],
    [
      "RATING_PAIR_DUPLICATE",
      "parejas película/usuario valoradas",
      tables.ratings.map((entry) => `${entry.movieId}:${entry.userId}`)
    ],
    ["BATCH_ID_DUPLICATE", "tandas semanales", tables.weeklyBatches.map((entry) => entry.id)],
    ["BATCH_ITEM_ID_DUPLICATE", "elementos de tanda", tables.weeklyBatchItems.map((entry) => entry.id)],
    [
      "BATCH_MOVIE_DUPLICATE",
      "películas repetidas dentro de una tanda",
      tables.weeklyBatchItems.map((entry) => `${entry.batchId}:${entry.movieId}`)
    ]
  ];

  for (const [code, label, values] of identityChecks) {
    for (const value of duplicateValues(values.filter(Boolean))) {
      addFinding("error", code, `Hay ${label} duplicados.`, { value });
    }
  }

  for (const entry of tables.pendingMovies) {
    if (!moviesById.has(entry.movieId)) {
      addFinding("error", "PENDING_MOVIE_ORPHAN", "Una pendiente no tiene película asociada.", {
        groupId: entry.groupId,
        movieId: entry.movieId
      });
    }
    if (watchedKeys.has(`${entry.groupId}:${entry.movieId}`)) {
      addFinding("error", "MOVIE_PENDING_AND_WATCHED", "Una película figura como pendiente y vista.", {
        groupId: entry.groupId,
        movieId: entry.movieId
      });
    }
  }

  for (const entry of tables.watchEntries) {
    if (!moviesById.has(entry.movieId)) {
      addFinding("error", "WATCH_MOVIE_ORPHAN", "Una vista no tiene película asociada.", {
        watchId: entry.id,
        movieId: entry.movieId
      });
    }
  }

  for (const entry of tables.ratings) {
    if (!moviesById.has(entry.movieId)) {
      addFinding("error", "RATING_MOVIE_ORPHAN", "Una valoración no tiene película asociada.", {
        ratingId: entry.id,
        movieId: entry.movieId
      });
    }
    if (!usersById.has(entry.userId)) {
      addFinding("error", "RATING_USER_ORPHAN", "Una valoración no tiene usuario asociado.", {
        ratingId: entry.id,
        userId: entry.userId
      });
    }
    if (
      !Number.isFinite(entry.score) ||
      entry.score < 0 ||
      entry.score > 10 ||
      Math.abs(entry.score * 4 - Math.round(entry.score * 4)) > QUARTER_EPSILON
    ) {
      addFinding(
        "error",
        "RATING_SCORE_INVALID",
        "Una valoración no respeta el rango 0–10 en incrementos de 0,25.",
        { ratingId: entry.id, score: entry.score }
      );
    }
  }

  for (const entry of tables.weeklyBatchItems) {
    if (!batchesById.has(entry.batchId)) {
      addFinding("error", "BATCH_ITEM_BATCH_ORPHAN", "Un elemento pertenece a una tanda inexistente.", {
        batchItemId: entry.id,
        batchId: entry.batchId
      });
    }
    if (!moviesById.has(entry.movieId)) {
      addFinding("error", "BATCH_ITEM_MOVIE_ORPHAN", "Una tanda contiene una película inexistente.", {
        batchItemId: entry.id,
        movieId: entry.movieId
      });
    }
  }

  for (const batch of tables.weeklyBatches) {
    if (!batch.selectedMovieId) continue;

    if (!moviesById.has(batch.selectedMovieId)) {
      addFinding("error", "BATCH_SELECTION_MOVIE_ORPHAN", "La selección semanal apunta a una película inexistente.", {
        batchId: batch.id,
        movieId: batch.selectedMovieId
      });
    }

  }

  const datedCollections = [
    ["pendingMovies", tables.pendingMovies, ["addedAt"]],
    ["watchEntries", tables.watchEntries, ["watchedOn", "createdAt", "updatedAt"]],
    ["ratings", tables.ratings, ["watchedOn", "createdAt", "updatedAt"]],
    ["weeklyBatches", tables.weeklyBatches, ["weekOf", "createdAt", "updatedAt"]],
    ["tmdbCacheEntries", tables.tmdbCacheEntries, ["fetchedAt", "expiresAt"]]
  ];

  for (const [collection, entries, fields] of datedCollections) {
    for (const entry of entries) {
      for (const field of fields) {
        if (!validDate(entry[field])) {
          addFinding("error", "DATE_INVALID", "Se ha encontrado una fecha inválida.", {
            collection,
            id: entry.id ?? entry.key ?? `${entry.groupId}:${entry.movieId}`,
            field,
            value: entry[field]
          });
        }
      }
    }
  }

  for (const record of tables.movies) {
    const data = movieData(record);
    const missing = [];
    if (typeof data.title !== "string" || !data.title.trim()) missing.push("título");
    if (!Number.isInteger(data.year) || data.year <= 0) missing.push("año");
    if (!hasUsefulGenres(data)) missing.push("género");
    if (!hasUsefulExternalRating(data)) missing.push("valoración externa");

    if (missing.length > 0) {
      addFinding(
        "warning",
        "MOVIE_METADATA_INCOMPLETE",
        `Una película tiene metadatos incompletos: ${missing.join(", ")}.`,
        { movieId: record.id, slug: record.slug, title: data.title ?? null, missing }
      );
    }
  }

  const snapshot = tables.appSnapshots.find((entry) => entry.id === "main") ?? tables.appSnapshots[0];
  if (!snapshot) {
    addFinding("warning", "APP_SNAPSHOT_MISSING", "No existe ningún snapshot agregado de la aplicación.");
  } else if (!isRecord(snapshot.data)) {
    addFinding("error", "APP_SNAPSHOT_INVALID", "El snapshot agregado no contiene un objeto válido.", {
      snapshotId: snapshot.id
    });
  } else {
    const snapshotUsers = Array.isArray(snapshot.data.users) ? snapshot.data.users : [];
    const snapshotMovies = Array.isArray(snapshot.data.movies) ? snapshot.data.movies : [];
    const groupMemberIds = Array.isArray(snapshot.data.group?.memberIds)
      ? snapshot.data.group.memberIds
      : [];

    for (const memberId of groupMemberIds) {
      if (!usersById.has(memberId)) {
        addFinding("error", "SNAPSHOT_GROUP_USER_ORPHAN", "El grupo referencia un usuario inexistente.", {
          snapshotId: snapshot.id,
          userId: memberId
        });
      }
    }

    const normalizedUserIds = new Set(tables.users.map((entry) => entry.id));
    const snapshotUserIds = new Set(snapshotUsers.map((entry) => entry.id));
    const normalizedMovieIds = new Set(tables.movies.map((entry) => entry.id));
    const snapshotMovieIds = new Set(snapshotMovies.map((entry) => entry.id));
    const missingSnapshotUsers = [...normalizedUserIds].filter((id) => !snapshotUserIds.has(id));
    const missingSnapshotMovies = [...normalizedMovieIds].filter((id) => !snapshotMovieIds.has(id));

    if (missingSnapshotUsers.length > 0) {
      addFinding("warning", "SNAPSHOT_USERS_STALE", "El snapshot no contiene todos los usuarios normalizados.", {
        snapshotId: snapshot.id,
        missingIds: missingSnapshotUsers
      });
    }
    if (missingSnapshotMovies.length > 0) {
      addFinding("warning", "SNAPSHOT_MOVIES_STALE", "El snapshot no contiene todas las películas normalizadas.", {
        snapshotId: snapshot.id,
        missingIds: missingSnapshotMovies
      });
    }
  }

  findings.sort((left, right) => {
    const rank = { error: 0, warning: 1, info: 2 };
    return rank[left.severity] - rank[right.severity] || left.code.localeCompare(right.code);
  });

  const severities = findings.reduce(
    (summary, finding) => {
      summary[finding.severity] += 1;
      return summary;
    },
    { error: 0, warning: 0, info: 0 }
  );

  return {
    healthy: severities.error === 0,
    counts: Object.fromEntries(Object.entries(tables).map(([name, entries]) => [name, entries.length])),
    severities,
    findings
  };
}

export function renderIntegrityReport(report, context = {}) {
  const lines = [
    `Entorno: ${context.environment ?? "desconocido"}`,
    `Base: ${context.databaseHost ?? "desconocida"}`,
    `Estado: ${report.healthy ? "sin errores de integridad" : "requiere atención"}`,
    `Hallazgos: ${report.severities.error} errores, ${report.severities.warning} avisos`,
    "",
    "Registros:",
    ...Object.entries(report.counts).map(([name, count]) => `  - ${name}: ${count}`)
  ];

  if (report.findings.length > 0) {
    lines.push("", "Detalle:");
    for (const finding of report.findings) {
      const references = Object.keys(finding.references).length
        ? ` ${JSON.stringify(finding.references)}`
        : "";
      lines.push(`  - [${finding.severity.toUpperCase()}] ${finding.code}: ${finding.message}${references}`);
    }
  }

  return lines.join("\n");
}
