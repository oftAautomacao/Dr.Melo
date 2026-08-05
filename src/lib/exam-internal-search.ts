export interface InternalExamAliasEntry {
  id: string;
  canonical: string;
  aliases: string[];
  searchTerms: string[];
}

export interface ResolvedProcedureCandidate {
  raw: string;
  label: string;
  score: number;
}

export interface InternalExamMatch {
  id: string;
  canonical: string;
  matchedAlias: string;
  aliases: string[];
  resolvedProcedures: ResolvedProcedureCandidate[];
}

interface RankedInternalExamMatch extends InternalExamMatch {
  _aliasScore: number;
}

export const INTERNAL_EXAM_ALIAS_ENTRIES: InternalExamAliasEntry[] = [
  {
    id: "biomicroscopia",
    canonical: "Biomicroscopia",
    aliases: ["Biomicroscopia", "Fundoscopia", "Fundo de olho"],
    searchTerms: ["Biomicroscopia", "Fundoscopia", "Fundo de olho"],
  },
  {
    id: "retinografia",
    canonical: "Retinografia",
    aliases: [
      "Retinografia",
      "Retinografia simples",
      "Retinografia colorida",
      "Retinografia simples ou colorida",
    ],
    searchTerms: [
      "Retinografia",
      "Retinografia simples",
      "Retinografia colorida",
    ],
  },
  {
    id: "angiografia",
    canonical: "Angiografia",
    aliases: [
      "Angiografia",
      "Retinografia fluorescenica",
      "Retinografia fluoresceinica",
      "Angiografia fluoresceinica",
    ],
    searchTerms: [
      "Angiografia",
      "Retinografia fluorescenica",
      "Retinografia fluoresceinica",
    ],
  },
  {
    id: "angiografia-autofluorescente",
    canonical: "Angiografia auto-fluorescente",
    aliases: [
      "Retinografia auto-fluorescenica",
      "Retinografia auto-fluorescente",
      "Angiografia auto-fluorescente",
      "Angiografia autofluorescente",
      "Angiografia - autofluorescenica",
    ],
    searchTerms: [
      "Angiografia auto-fluorescente",
      "Angiografia autofluorescente",
      "Angiografia - autofluorescenica",
      "Retinografia auto-fluorescenica",
      "Retinografia auto-fluorescente",
    ],
  },
];

export function cloneInternalExamAliasEntries(entries: InternalExamAliasEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    aliases: [...entry.aliases],
    searchTerms: [...entry.searchTerms],
  }));
}

export function normalizeExamLookupText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatProcedureName(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase())
    .trim();
}

function tokensMatch(text: string, query: string) {
  const queryTokens = query.split(" ").filter(Boolean);
  if (queryTokens.length === 0) return false;
  return queryTokens.every((token) => text.includes(token));
}

function tokenize(value: string) {
  return value.split(" ").filter(Boolean);
}

function editDistance(a: string, b: string) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
}

function buildBigrams(value: string) {
  if (value.length < 2) return [value];

  const bigrams: string[] = [];
  for (let i = 0; i < value.length - 1; i++) {
    bigrams.push(value.slice(i, i + 2));
  }
  return bigrams;
}

function diceCoefficient(a: string, b: string) {
  const aBigrams = buildBigrams(a);
  const bBigrams = buildBigrams(b);
  const counts = new Map<string, number>();

  aBigrams.forEach((bigram) => {
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  });

  let overlap = 0;
  bBigrams.forEach((bigram) => {
    const count = counts.get(bigram) ?? 0;
    if (count > 0) {
      overlap++;
      counts.set(bigram, count - 1);
    }
  });

  return (2 * overlap) / (aBigrams.length + bBigrams.length);
}

function tokensLooselyMatch(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const distance = editDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (
    (maxLen >= 10 && distance <= 4) ||
    (maxLen >= 7 && distance <= 3) ||
    (maxLen >= 4 && distance <= 2)
  ) {
    return true;
  }

  if (maxLen >= 7 && diceCoefficient(a, b) >= 0.55) {
    return true;
  }

  return false;
}

function getAliasMatchScore(alias: string, query: string) {
  if (!alias || !query) return 0;
  if (alias === query) return 200;
  if (alias.includes(query)) return 160 + tokenize(alias).length * 5;
  if (query.includes(alias)) return 110 + tokenize(alias).length * 5;

  const aliasTokens = tokenize(alias);
  const queryTokens = tokenize(query);
  if (aliasTokens.length === 0 || queryTokens.length === 0) return 0;

  let matchedTokens = 0;
  let fuzzyMatchedTokens = 0;

  queryTokens.forEach((queryToken) => {
    const matchedAliasToken = aliasTokens.find((aliasToken) =>
      tokensLooselyMatch(aliasToken, queryToken)
    );

    if (!matchedAliasToken) return;

    matchedTokens++;
    if (matchedAliasToken !== queryToken) {
      fuzzyMatchedTokens++;
    }
  });

  if (matchedTokens === 0) return 0;

  const coverageScore = matchedTokens * 45;
  const specificityBonus = aliasTokens.length * 12;
  const fullCoverageBonus = matchedTokens === queryTokens.length ? 35 : 0;
  const fuzzyBonus = fuzzyMatchedTokens > 0 ? 8 : 0;

  return coverageScore + specificityBonus + fullCoverageBonus + fuzzyBonus;
}

function scoreTermMatch(candidate: string, term: string) {
  if (!candidate || !term) return 0;
  if (candidate === term) return 100;
  if (candidate.startsWith(term) || term.startsWith(candidate)) return 80;
  if (candidate.includes(term) || term.includes(candidate)) return 60;
  if (tokensMatch(candidate, term)) return 45;
  return 0;
}

function resolveProcedureCandidates(entry: InternalExamAliasEntry, procedures: string[]) {
  const seen = new Set<string>();
  const candidates: ResolvedProcedureCandidate[] = [];

  procedures.forEach((procedure) => {
    const label = formatProcedureName(procedure);
    const rawNorm = normalizeExamLookupText(procedure);
    const labelNorm = normalizeExamLookupText(label);

    let bestScore = 0;
    for (const term of [entry.canonical, ...entry.searchTerms, ...entry.aliases]) {
      const normalizedTerm = normalizeExamLookupText(term);
      bestScore = Math.max(
        bestScore,
        scoreTermMatch(rawNorm, normalizedTerm),
        scoreTermMatch(labelNorm, normalizedTerm)
      );
    }

    if (bestScore > 0 && !seen.has(procedure)) {
      seen.add(procedure);
      candidates.push({ raw: procedure, label, score: bestScore });
    }
  });

  return candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

export function findInternalExamMatches(
  query: string,
  procedures: string[],
  entries: InternalExamAliasEntry[] = INTERNAL_EXAM_ALIAS_ENTRIES
): InternalExamMatch[] {
  const normalizedQuery = normalizeExamLookupText(query);
  if (!normalizedQuery) return [];

  return entries
    .map((entry) => {
      const bestAliasMatch = entry.aliases
        .map((alias) => {
          const normalizedAlias = normalizeExamLookupText(alias);
          return {
            alias,
            score: getAliasMatchScore(normalizedAlias, normalizedQuery),
          };
        })
        .sort((a, b) => b.score - a.score)[0];

      if (!bestAliasMatch || bestAliasMatch.score <= 0) return null;

      return {
        id: entry.id,
        canonical: entry.canonical,
        matchedAlias: bestAliasMatch.alias,
        aliases: entry.aliases,
        resolvedProcedures: resolveProcedureCandidates(entry, procedures),
        _aliasScore: bestAliasMatch.score,
      };
    })
    .filter((entry): entry is RankedInternalExamMatch => Boolean(entry))
    .sort((a, b) => {
      const aliasDiff = (b?._aliasScore ?? 0) - (a?._aliasScore ?? 0);
      if (aliasDiff !== 0) return aliasDiff;

      const procedureDiff =
        (b?.resolvedProcedures[0]?.score ?? 0) - (a?.resolvedProcedures[0]?.score ?? 0);
      if (procedureDiff !== 0) return procedureDiff;

      return (a?.canonical ?? "").localeCompare(b?.canonical ?? "");
    })
    .map(({ _aliasScore, ...entry }) => entry);
}
