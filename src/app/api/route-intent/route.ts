import { NextResponse } from "next/server";

import { getCheckpoints } from "@/lib/services/checkpoints";
import { normalizePlaceLabel } from "@/lib/data/cities";
import type { MapCheckpoint } from "@/lib/types/map";
import type { ParsedNaturalLanguageIntent } from "@/lib/types/route-intent";
import { logRoutingDebug } from "@/lib/utils/routing-debug";

export const runtime = "nodejs";

interface RouteIntentRequestBody {
  text?: string | null;
  prompt?: string | null;
  message?: string | null;
}

function getGroqApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is required for route intent parsing.");
  }

  return apiKey;
}

function readPrompt(body: RouteIntentRequestBody | null | undefined): string {
  const candidate = body?.text ?? body?.prompt ?? body?.message ?? "";
  return typeof candidate === "string" ? candidate.trim() : "";
}

function normalizeModelName(value: string): string {
  return value.trim();
}

function getRandomGroqModel(): string {
  const models = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
  ].map(normalizeModelName);
  const index = Math.floor(Math.random() * models.length);
  return models[index] ?? models[0];
}

function getGroqModelFallbackOrder(): string[] {
  const models = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
  ].map(normalizeModelName);

  const firstModel = getRandomGroqModel();
  const remainingModels = models.filter((model) => model !== firstModel);

  for (let index = remainingModels.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [remainingModels[index], remainingModels[swapIndex]] = [
      remainingModels[swapIndex] ?? remainingModels[index],
      remainingModels[index] ?? remainingModels[swapIndex],
    ];
  }

  return [firstModel, ...remainingModels];
}

function buildSystemPrompt(): string {
  return [
    "You classify Mashwar navigation prompts into a single intent.",
    "Return only one raw JSON object and nothing else.",
    "Do not use markdown, code fences, comments, or explanations.",
    "Use exactly these top-level keys: kind, confidence, time, entities, needsClarification.",
    "Use exactly these entities keys: checkpointId, originCity, destinationCity, checkpointName, checkpointDirection, wantsSimulation, sourceHint.",
    "The response must be valid JSON with double-quoted keys and strings.",
    "The user may write in Arabic, English, or a mix of both.",
    "Classify as route when the user is asking for travel between places or asking about departure windows.",
    "Classify as checkpoint when the user is asking about a checkpoint status, checkpoint forecast, or checkpoint prediction.",
    "Use kind=route when the prompt mentions origin/destination cities, current location to a city, or route comparisons.",
    "Use kind=checkpoint when the prompt names a checkpoint or asks about a barrier/control point status.",
    "Set time to a concrete datetime string if one can be inferred, otherwise null.",
    "The user message includes checkpointCandidates, which is a small fuzzy-matched subset of live checkpoints.",
    "Use those checkpointCandidates to infer the most likely checkpoint id, even if the prompt has typos, transliterations, or Arabic spelling variations.",
    "Always fill checkpointId when you can identify the checkpoint from the candidates.",
    "If you are unsure between multiple checkpoints, use the closest catalog match and keep needsClarification=false only when one match is clearly best.",
    "For route prompts, fill originCity and destinationCity when you can infer them from the prompt.",
    "If the user only provides a destination city like 'to Jenin', leave originCity null so the client can use the current location.",
    "If the user asks for departure comparisons or 'what if' style planning, set wantsSimulation=true.",
    "If the prompt is ambiguous or missing an essential entity, set needsClarification=true.",
    "Do not invent city names or checkpoint names that are not supported by the prompt.",
    "When in doubt between route and checkpoint, prefer checkpoint only if the prompt clearly centers on checkpoint status.",
  ].join(" ");
}

function extractJsonObject(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }

  return withoutFences.slice(firstBrace, lastBrace + 1);
}

function parseIntentContent(content: string): ParsedNaturalLanguageIntent | null {
  const json = extractJsonObject(content);
  if (!json) {
    return null;
  }

  try {
    return JSON.parse(json) as ParsedNaturalLanguageIntent;
  } catch {
    return null;
  }
}

type CheckpointPromptEntry = MapCheckpoint & {
  searchableLabel: string;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ");
}

function tokenizeText(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function overlapScore(promptTokens: string[], labelTokens: string[]): number {
  if (promptTokens.length === 0 || labelTokens.length === 0) {
    return 0;
  }

  const promptSet = new Set(promptTokens);
  const labelSet = new Set(labelTokens);
  const shared = Array.from(promptSet).filter((token) => labelSet.has(token));

  return shared.length / Math.max(1, Math.min(promptSet.size, labelSet.size));
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);
  const currentRow = new Array<number>(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    currentRow[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const insertion = currentRow[j - 1] + 1;
      const deletion = previousRow[j] + 1;
      const substitution =
        previousRow[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      currentRow[j] = Math.min(insertion, deletion, substitution);
    }

    for (let j = 0; j <= right.length; j += 1) {
      previousRow[j] = currentRow[j];
    }
  }

  return previousRow[right.length] ?? 0;
}

function similarityScore(left: string, right: string): number {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return 0.95;
  }

  const leftTokens = tokenizeText(normalizedLeft);
  const rightTokens = tokenizeText(normalizedRight);
  const tokenScore = overlapScore(leftTokens, rightTokens);
  const prefixScore =
    leftTokens.length > 0 &&
    rightTokens.length > 0 &&
    (leftTokens[0] === rightTokens[0] ||
      leftTokens[0]?.startsWith(rightTokens[0] ?? "") ||
        rightTokens[0]?.startsWith(leftTokens[0] ?? ""))
      ? 0.2
      : 0;
  const distance = levenshteinDistance(normalizedLeft, normalizedRight);
  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
  const distanceScore = maxLength > 0 ? Math.max(0, 1 - distance / maxLength) : 0;

  return Math.min(1, tokenScore * 0.6 + distanceScore * 0.3 + prefixScore);
}

function getCheckpointCandidateScore(
  prompt: string,
  checkpoint: CheckpointPromptEntry,
): number {
  const promptText = normalizeText(prompt);
  const labels = [
    checkpoint.searchableLabel,
    checkpoint.name,
    checkpoint.city ?? "",
    checkpoint.id,
  ]
    .map((value) => normalizeText(value))
    .filter((value) => value.length > 0);

  if (labels.length === 0 || !promptText) {
    return 0;
  }

  const promptTokens = tokenizeText(promptText);
  const labelTokens = labels.flatMap((label) => tokenizeText(label));
  const tokenOverlap = overlapScore(promptTokens, labelTokens);
  const bestLabelSimilarity = labels.reduce((best, label) => {
    return Math.max(best, similarityScore(promptText, label));
  }, 0);

  return Math.max(bestLabelSimilarity, tokenOverlap);
}

function buildCheckpointCandidates(
  prompt: string,
  checkpoints: CheckpointPromptEntry[],
): Array<CheckpointPromptEntry & { matchScore: number }> {
  const scored = checkpoints
    .map((checkpoint) => ({
      ...checkpoint,
      matchScore: getCheckpointCandidateScore(prompt, checkpoint),
    }))
    .filter((checkpoint) => checkpoint.matchScore > 0.08);

  scored.sort((left, right) => {
    if (right.matchScore !== left.matchScore) {
      return right.matchScore - left.matchScore;
    }

    return left.name.localeCompare(right.name);
  });

  const top = scored.slice(0, 6);
  const threshold = top[0]?.matchScore ?? 0;
  const relaxedThreshold = Math.max(0.12, threshold * 0.6);

  const selected = scored.filter((candidate, index) => {
    if (index < 3) {
      return true;
    }

    return candidate.matchScore >= relaxedThreshold;
  });

  if (selected.length > 0) {
    return selected.slice(0, 8);
  }

  return scored.slice(0, 5);
}

async function buildCheckpointCatalog() {
  const checkpoints = await getCheckpoints();
  return checkpoints.map((checkpoint): CheckpointPromptEntry => ({
    ...checkpoint,
    searchableLabel: normalizePlaceLabel(
      [checkpoint.id, checkpoint.name, checkpoint.city].filter(Boolean).join(" "),
    ),
  }));
}

async function callGroq(
  prompt: string,
  checkpointCatalog: Awaited<ReturnType<typeof buildCheckpointCatalog>>,
): Promise<ParsedNaturalLanguageIntent> {
  const checkpointCandidates = buildCheckpointCandidates(prompt, checkpointCatalog);
  const requestPayload = {
    prompt,
    checkpointCandidates,
  };

  const modelOrder = getGroqModelFallbackOrder();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < modelOrder.length; attempt += 1) {
    const model = modelOrder[attempt];
    if (!model) {
      continue;
    }

    logRoutingDebug("Groq route-intent request", {
      attempt: attempt + 1,
      attemptCount: modelOrder.length,
      model,
    prompt,
    checkpointCount: checkpointCatalog.length,
    checkpointCandidateCount: checkpointCandidates.length,
    checkpointCandidates: checkpointCandidates.slice(0, 5),
  });

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getGroqApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(),
          },
          {
            role: "user",
            content: JSON.stringify(requestPayload),
          },
        ],
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      lastError = new Error(
        errorText.trim() || `Groq request failed with status ${response.status}.`,
      );
      logRoutingDebug("Groq route-intent model failed", {
        attempt: attempt + 1,
        model,
        status: response.status,
        errorText,
      });
      continue;
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      lastError = new Error("Groq did not return a route intent payload.");
      logRoutingDebug("Groq route-intent empty response", {
        attempt: attempt + 1,
        model,
      });
      continue;
    }

    const parsed = parseIntentContent(content);
    if (!parsed) {
      lastError = new Error(
        `Groq returned non-JSON route intent content for model ${model}.`,
      );
      logRoutingDebug("Groq route-intent parse failure", {
        attempt: attempt + 1,
        model,
        rawContent: content,
      });
      continue;
    }

    logRoutingDebug("Groq route-intent response", {
      attempt: attempt + 1,
      model,
      rawContent: content,
      parsed,
    });
    return parsed;
  }

  throw lastError ?? new Error("Groq request failed.");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as RouteIntentRequestBody | null;
    const prompt = readPrompt(body);

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt text is required." },
        { status: 400 },
      );
    }

    logRoutingDebug("Groq route-intent inbound request", {
      prompt,
      body,
    });

    const checkpointCatalog = await buildCheckpointCatalog();
    logRoutingDebug("Groq route-intent checkpoint catalog", {
      checkpointCount: checkpointCatalog.length,
      sample: checkpointCatalog.slice(0, 8),
    });

    const result = await callGroq(prompt, checkpointCatalog);
    logRoutingDebug("Groq route-intent final response", result);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to parse route intent.";
    const status = message.includes("GROQ_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
