function resolveChatUrl(baseUrl, addVersionPrefix) {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (trimmed.endsWith("/chat-messages")) {
    return trimmed;
  }
  if (addVersionPrefix) {
    if (trimmed.endsWith("/v1")) {
      return `${trimmed}/chat-messages`;
    }
    if (trimmed.includes("/v1/")) {
      return `${trimmed}/chat-messages`;
    }
    return `${trimmed}/v1/chat-messages`;
  }
  return `${trimmed}/chat-messages`;
}
export async function sendDifyChat(options) {
  const { baseUrl, apiKey, payload, abortSignal, addVersionPrefix = true, logLabel = "Dify Chat" } = options;
  if (!baseUrl) {
    throw new Error(`[${logLabel}] Missing Dify API URL`);
  }
  if (!apiKey) {
    throw new Error(`[${logLabel}] Missing Dify API key`);
  }
  const finalUrl = resolveChatUrl(baseUrl, addVersionPrefix);
  const response = await fetch(finalUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      "User-Agent": "Supabase-Edge-Function/1.0"
    },
    body: JSON.stringify(payload),
    signal: abortSignal
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[${logLabel}] ${response.status} ${response.statusText}: ${errorText}`);
  }
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let answer = "";
  let conversationId;
  let messageId;
  const rawEvents = [];
  let buffer = "";
  if (reader) {
    while(true){
      if (abortSignal?.aborted) {
        throw new DOMException("Request aborted", "AbortError");
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, {
        stream: true
      });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines){
        if (!line.startsWith("data: ")) {
          continue;
        }
        const jsonSegment = line.substring(6).trim();
        if (!jsonSegment) {
          continue;
        }
        try {
          const event = JSON.parse(jsonSegment);
          rawEvents.push(event);
          if (event.event === "message") {
            answer += event.answer ?? "";
            conversationId = event.conversation_id ?? conversationId;
            messageId = event.id ?? messageId;
          } else if (event.event === "message_end") {
            conversationId = event.conversation_id ?? conversationId;
            messageId = event.message_id ?? event.id ?? messageId;
          }
        } catch (error) {
          // Ignore parsing errors but log minimal detail for troubleshooting
          console.warn(`[${logLabel}] Failed to parse Dify event`, jsonSegment.substring(0, 120));
        }
      }
    }
  }
  return {
    answer: answer.trim(),
    conversationId,
    messageId,
    rawEvents
  };
}
export { resolveChatUrl as buildDifyChatUrl };
