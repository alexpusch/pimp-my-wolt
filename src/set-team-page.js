const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.6-luna";

const apiKeyInput = document.getElementById("openrouter-api-key");
const modelInput = document.getElementById("openrouter-model");
const status = document.getElementById("ai-settings-status");

chrome.storage.local.get(["openRouterApiKey", "openRouterModel"], (settings) => {
  modelInput.value = settings.openRouterModel || DEFAULT_OPENROUTER_MODEL;
  if (settings.openRouterApiKey) {
    apiKeyInput.placeholder = "Saved API key";
  }
});

document.getElementById("save-ai-settings").addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim() || DEFAULT_OPENROUTER_MODEL;
  if (!apiKey) {
    status.textContent = "Enter an API key.";
    return;
  }
  chrome.storage.local.set({ openRouterApiKey: apiKey, openRouterModel: model }, () => {
    apiKeyInput.value = "";
    apiKeyInput.placeholder = "Saved API key";
    status.textContent = "AI settings saved.";
  });
});
