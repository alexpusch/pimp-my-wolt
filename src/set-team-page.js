const input = document.getElementById("team");

input.addEventListener("change", () => {
  const teamName = input.value;
  chrome.storage.sync.set({ teamName });
});

chrome.storage.sync.get("teamName", ({ teamName }) => {
  input.value = teamName || "";
});

const apiKeyInput = document.getElementById("openrouter-api-key");
const modelInput = document.getElementById("openrouter-model");
const status = document.getElementById("ai-settings-status");

chrome.storage.local.get(["openRouterApiKey", "openRouterModel"], (settings) => {
  modelInput.value = settings.openRouterModel || "";
  if (settings.openRouterApiKey) {
    apiKeyInput.placeholder = "Saved API key";
  }
});

document.getElementById("save-ai-settings").addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim();
  if (!apiKey || !model) {
    status.textContent = "Enter both an API key and model identifier.";
    return;
  }
  chrome.storage.local.set({ openRouterApiKey: apiKey, openRouterModel: model }, () => {
    apiKeyInput.value = "";
    apiKeyInput.placeholder = "Saved API key";
    status.textContent = "AI settings saved.";
  });
});
