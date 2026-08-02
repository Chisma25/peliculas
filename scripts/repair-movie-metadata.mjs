import { PrismaClient } from "@prisma/client";

import { parseArguments, prepareDatabaseTarget } from "./lib/database-operations.mjs";

const args = parseArguments();
const target = prepareDatabaseTarget(args);
const apply = args.apply === true;
const confirmation = typeof args.confirm === "string" ? args.confirm.trim().toLowerCase() : "";
const apiKey = process.env.TMDB_API_KEY?.trim();

if (!apiKey) {
  throw new Error("Falta TMDB_API_KEY.");
}

if (apply && confirmation !== target.environment) {
  throw new Error(`Para aplicar cambios añade --confirm=${target.environment}.`);
}

const LANGUAGE_LABELS = {
  en: "Inglés",
  es: "Español",
  fr: "Francés",
  de: "Alemán",
  it: "Italiano",
  ja: "Japonés",
  ko: "Coreano",
  pt: "Portugués",
  zh: "Chino",
  ru: "Ruso",
  da: "Danés",
  nl: "Neerlandés",
  ar: "Árabe",
  cs: "Checo",
  no: "Noruego",
  sv: "Sueco",
  pl: "Polaco",
  tr: "Turco",
  hi: "Hindi"
};

function formatLanguage(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Pendiente";
  return LANGUAGE_LABELS[normalized] ?? normalized.toUpperCase();
}

function imageUrl(path, size) {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
}

async function fetchDetails(tmdbId) {
  const url = new URL(`https://api.themoviedb.org/3/movie/${encodeURIComponent(tmdbId)}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "es-ES");
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`TMDb ${tmdbId} respondió HTTP ${response.status}.`);
  }
  return response.json();
}

async function mapWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

const prisma = new PrismaClient();

try {
  const records = await prisma.movieRecord.findMany({ orderBy: { createdAt: "asc" } });
  const candidates = records.filter((record) => record.data?.sourceIds?.tmdb);
  const failures = [];

  const inspected = await mapWithConcurrency(candidates, 5, async (record) => {
    const data = record.data;
    try {
      const details = await fetchDetails(data.sourceIds.tmdb);
      const nextData = {
        ...data,
        originalTitle: details.original_title || data.originalTitle,
        language: formatLanguage(details.original_language),
        posterUrl: imageUrl(details.poster_path, "w500") || data.posterUrl,
        backdrop: imageUrl(details.backdrop_path, "w780") || data.backdrop,
        metadataVersion: 3,
        popularity: Number.isFinite(details.popularity) ? details.popularity : data.popularity,
        voteCount: Number.isFinite(details.vote_count) ? details.vote_count : data.voteCount
      };
      const changed = JSON.stringify(nextData) !== JSON.stringify(data);
      return { record, nextData, changed };
    } catch (error) {
      failures.push({
        id: record.id,
        title: data.title,
        error: error instanceof Error ? error.message : String(error)
      });
      return { record, nextData: data, changed: false };
    }
  });

  const changes = inspected.filter((item) => item.changed);
  console.log(
    JSON.stringify(
      {
        environment: target.environment,
        databaseHost: target.databaseHost,
        mode: apply ? "apply" : "dry-run",
        inspected: candidates.length,
        changes: changes.length,
        failures,
        sample: changes.slice(0, 20).map(({ record, nextData }) => ({
          id: record.id,
          title: record.data.title,
          previousLanguage: record.data.language,
          nextLanguage: nextData.language,
          originalTitle: nextData.originalTitle,
          addedBackdrop: !record.data.backdrop && Boolean(nextData.backdrop)
        }))
      },
      null,
      2
    )
  );

  if (apply && changes.length > 0) {
    await prisma.$transaction(
      changes.map(({ record, nextData }) =>
        prisma.movieRecord.update({
          where: { id: record.id },
          data: { data: nextData }
        })
      )
    );
    console.log(`Metadatos actualizados: ${changes.length}.`);
  }

  if (failures.length > 0) {
    process.exitCode = 2;
  }
} finally {
  await prisma.$disconnect();
}
