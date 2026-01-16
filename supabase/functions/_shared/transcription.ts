export interface TranscriptionConfig {
  url: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
  provider: "azure" | "openai";
}

const AZURE_CONFIG = {
  apiKey: "AZURE_API_KEY",
  endpoint: "AZURE_OPENAI_TRANSCRIPTION_ENDPOINT",
  model: "AZURE_OPENAI_TRANSCRIPTION_MODEL",
} as const;

const OPENAI_CONFIG = {
  apiKey: "OPENAI_API_KEY",
  endpoint: "OPENAI_TRANSCRIPTION_ENDPOINT",
  model: "OPENAI_TRANSCRIPTION_MODEL",
} as const;

function resolveTranscriptionProvider(): TranscriptionConfig {
  const azureKey = Deno.env.get(AZURE_CONFIG.apiKey);
  if (azureKey) {
    return {
      url: Deno.env.get(AZURE_CONFIG.endpoint),
      apiKey: azureKey,
      model: Deno.env.get(AZURE_CONFIG.model),
      provider: "azure",
    };
  }

  const openAiKey = Deno.env.get(OPENAI_CONFIG.apiKey);
  return {
    url: Deno.env.get(OPENAI_CONFIG.endpoint),
    apiKey: openAiKey,
    model: Deno.env.get(OPENAI_CONFIG.model),
    provider: "openai",
  };
}

export async function transcribeAudio(
  audioFile: File,
  abortSignal: AbortSignal,
): Promise<string> {
  const config = resolveTranscriptionProvider();

  if (!config.apiKey) {
    const missingKey = config.provider === "azure"
      ? AZURE_CONFIG.apiKey
      : OPENAI_CONFIG.apiKey;
    throw new Error(
      `${
        config.provider === "azure" ? "Azure" : "OpenAI"
      } API key not configured (${missingKey})`,
    );
  }

  if (!config.url) {
    const missingUrl = config.provider === "azure"
      ? AZURE_CONFIG.endpoint
      : OPENAI_CONFIG.endpoint;
    throw new Error(
      `${
        config.provider === "azure" ? "Azure" : "OpenAI"
      } transcription endpoint not configured (${missingUrl})`,
    );
  }

  if (!config.model) {
    const missingModel = config.provider === "azure"
      ? AZURE_CONFIG.model
      : OPENAI_CONFIG.model;
    throw new Error(
      `${
        config.provider === "azure" ? "Azure" : "OpenAI"
      } transcription model not configured (${missingModel})`,
    );
  }

  const body = new FormData();
  body.append("file", audioFile);
  body.append("model", config.model);

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body,
    signal: abortSignal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Transcription API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const transcription = (result.text as string | undefined)?.trim() ?? "";
  console.log("✅ Transcription:", transcription || "[empty/unclear speech]", {
    provider: config.provider,
  });
  return transcription;
}

export { resolveTranscriptionProvider as getTranscriptionConfig };
