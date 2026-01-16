import { sendDifyChat } from "../dify.ts";
import { convertTextToSpeech } from "../elevenlabs.ts";
export async function executeVoiceTurn(params) {
  const { payload, dify, abortSignal, fallbackMessage } = params;
  const { baseUrl, apiKey, addVersionPrefix = true, logLabel = "Dify Chat" } = dify;
  const difyResult = await sendDifyChat({
    baseUrl,
    apiKey,
    payload,
    abortSignal,
    addVersionPrefix,
    logLabel
  });
  let aiMessage = difyResult.answer.trim();
  if (!aiMessage) {
    aiMessage = fallbackMessage ?? "I'm here to help you stay focused, Captain. What would you like to know?";
  }
  const ttsResult = await convertTextToSpeech(aiMessage);
  return {
    aiMessage,
    difyResult,
    ttsResult
  };
}
