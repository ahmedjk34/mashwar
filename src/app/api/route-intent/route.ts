import { NextResponse } from "next/server";

import { getCheckpoints } from "@/lib/services/checkpoints";
import { normalizePlaceLabel } from "@/lib/data/cities";
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
    "The checkpoint catalog is exhaustive and contains every live checkpoint with its exact id and current city.",
    "When the user means a checkpoint, pick the closest checkpoint from the catalog even if the prompt has typos, transliterations, or Arabic spelling variations.",
    "Always fill checkpointId when you can identify the checkpoint from the catalog.",
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

function buildCheckpointCatalogEntry(checkpoint: {
  id: string;
  name: string;
  city: string | null;
  enteringStatus: string;
  leavingStatus: string;
}) {
  const searchableLabel = normalizePlaceLabel(
    [checkpoint.id, checkpoint.name, checkpoint.city].filter(Boolean).join(" "),
  );

  return {
    id: checkpoint.id,
    name: checkpoint.name,
    city: checkpoint.city,
    enteringStatus: checkpoint.enteringStatus,
    leavingStatus: checkpoint.leavingStatus,
    searchableLabel,
  };
}

async function buildCheckpointCatalog() {
  const checkpoints = await getCheckpoints();
  return checkpoints.map((checkpoint) =>
    buildCheckpointCatalogEntry({
      id: checkpoint.id,
      name: checkpoint.name,
      city: checkpoint.city,
      enteringStatus: checkpoint.enteringStatus,
      leavingStatus: checkpoint.leavingStatus,
    }),
  );
}

async function callGroq(
  prompt: string,
  checkpointCatalog: Awaited<ReturnType<typeof buildCheckpointCatalog>>,
): Promise<ParsedNaturalLanguageIntent> {
  const modelCandidates = [
    getRandomGroqModel(),
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
  ].filter((value, index, array) => array.indexOf(value) === index);

  const requestPayload = {
    prompt,
    checkpointCatalog,
  };

  let lastError: Error | null = null;
  for (const model of modelCandidates) {
    logRoutingDebug("Groq route-intent request", {
      model,
      prompt,
      checkpointCount: checkpointCatalog.length,
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
      continue;
    }

    const parsed = parseIntentContent(content);
    if (!parsed) {
      lastError = new Error(
        `Groq returned non-JSON route intent content for model ${model}.`,
      );
      logRoutingDebug("Groq route-intent parse failure", {
        model,
        rawContent: content,
      });
      continue;
    }

    logRoutingDebug("Groq route-intent response", {
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
