import { CIBUS_MATCH_CACHE_KEY } from "./cibus-match-cache.js";

const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.6-luna";

const apiKeyInput = document.getElementById("openrouter-api-key");
const modelInput = document.getElementById("openrouter-model");
const status = document.getElementById("ai-settings-status");
const cacheStatus = document.getElementById("cache-status");
const cachedMatchesContainer = document.getElementById("cached-name-matches");

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

function renderCachedMatches(cache) {
  const header = cachedMatchesContainer.querySelector(".cache-header");
  cachedMatchesContainer.replaceChildren(header);
  const matches = Object.entries(cache || {}).sort(([firstWoltName], [secondWoltName]) =>
    firstWoltName.localeCompare(secondWoltName)
  );

  if (matches.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-cache";
    emptyMessage.textContent = "No saved name matches.";
    cachedMatchesContainer.append(emptyMessage);
  } else {
    for (const [woltName, cibusName] of matches) {
      const entry = document.createElement("div");
      entry.className = "cache-entry";

      const woltNameElement = document.createElement("span");
      woltNameElement.className = "cache-entry-name";
      woltNameElement.textContent = woltName;

      const arrow = document.createElement("span");
      arrow.className = "cache-arrow";
      arrow.textContent = "to";

      const cibusNameElement = document.createElement("span");
      cibusNameElement.className = "cache-entry-name";
      cibusNameElement.textContent = cibusName;

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-cache-entry";
      deleteButton.type = "button";
      deleteButton.setAttribute("aria-label", `Delete match for ${woltName}`);
      deleteButton.title = "Delete name match";
      deleteButton.addEventListener("click", () => deleteCachedMatch(woltName));

      entry.append(woltNameElement, arrow, cibusNameElement, deleteButton);
      cachedMatchesContainer.append(entry);
    }
  }

  const addEntry = document.createElement("div");
  addEntry.className = "cache-entry cache-add-entry";

  const woltNameInput = document.createElement("input");
  woltNameInput.type = "text";
  woltNameInput.autocomplete = "off";
  woltNameInput.setAttribute("aria-label", "Wolt name");

  const spacer = document.createElement("span");

  const cibusNameInput = document.createElement("input");
  cibusNameInput.type = "text";
  cibusNameInput.autocomplete = "off";
  cibusNameInput.setAttribute("aria-label", "Cibus name");

  const addButton = document.createElement("button");
  addButton.className = "add-cache-entry";
  addButton.type = "button";
  addButton.setAttribute("aria-label", "Add name match");
  addButton.title = "Add name match";
  addButton.addEventListener("click", () => addCachedMatch(woltNameInput, cibusNameInput));

  addEntry.append(woltNameInput, spacer, cibusNameInput, addButton);
  cachedMatchesContainer.append(addEntry);
}

function loadCachedMatches() {
  chrome.storage.local.get(CIBUS_MATCH_CACHE_KEY, (settings) => {
    renderCachedMatches(settings[CIBUS_MATCH_CACHE_KEY]);
  });
}

function deleteCachedMatch(woltName) {
  chrome.storage.local.get(CIBUS_MATCH_CACHE_KEY, (settings) => {
    const cache = { ...(settings[CIBUS_MATCH_CACHE_KEY] || {}) };
    delete cache[woltName];
    chrome.storage.local.set({ [CIBUS_MATCH_CACHE_KEY]: cache }, () => {
      cacheStatus.textContent = "Name match deleted.";
      renderCachedMatches(cache);
    });
  });
}

function addCachedMatch(woltNameInput, cibusNameInput) {
  const woltName = woltNameInput.value.trim();
  const cibusName = cibusNameInput.value.trim();

  if (!woltName || !cibusName) {
    cacheStatus.textContent = "Enter both names.";
    return;
  }

  chrome.storage.local.get(CIBUS_MATCH_CACHE_KEY, (settings) => {
    const cache = { ...(settings[CIBUS_MATCH_CACHE_KEY] || {}), [woltName]: cibusName };
    chrome.storage.local.set({ [CIBUS_MATCH_CACHE_KEY]: cache }, () => {
      woltNameInput.value = "";
      cibusNameInput.value = "";
      cacheStatus.textContent = "Name match saved.";
      renderCachedMatches(cache);
    });
  });
}

loadCachedMatches();
