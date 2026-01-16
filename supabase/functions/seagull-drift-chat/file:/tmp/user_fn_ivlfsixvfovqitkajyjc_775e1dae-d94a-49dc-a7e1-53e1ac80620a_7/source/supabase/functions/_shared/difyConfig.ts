export function validateDifyConfig(apiKey, baseUrl) {
  if (!apiKey || !baseUrl) {
    throw new Error("Dify API configuration missing");
  }
}
