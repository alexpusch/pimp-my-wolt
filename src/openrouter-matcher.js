import { OpenRouter } from "@openrouter/sdk";

const MAX_NAMES = 50;

let activeRequest;

export function validateMatches(woltNames, cibusNames, matches) {
    if (!Array.isArray(matches)) return [];

    const knownWoltNames = new Set(woltNames);
    const knownCibusNames = new Set(cibusNames);
    const woltAssignments = new Map();
    const cibusAssignments = new Map();

    for (const match of matches) {
        if (
            !match ||
            typeof match.woltName !== "string" ||
            typeof match.cibusName !== "string" ||
            !knownWoltNames.has(match.woltName) ||
            !knownCibusNames.has(match.cibusName)
        ) {
            return [];
        }
        woltAssignments.set(match.woltName, (woltAssignments.get(match.woltName) || 0) + 1);
        cibusAssignments.set(match.cibusName, (cibusAssignments.get(match.cibusName) || 0) + 1);
    }

    if ([...woltAssignments.values(), ...cibusAssignments.values()].some((count) => count > 1)) {
        return [];
    }

    return matches.map(({ woltName, cibusName }) => ({ woltName, cibusName }));
}

export function applyMatchesToDebts(debts, matches) {
    const cibusNamesByWoltName = new Map(matches.map(({ woltName, cibusName }) => [woltName, cibusName]));
    return debts
        .filter(({ woltName }) => cibusNamesByWoltName.has(woltName))
        .map((debt) => ({ ...debt, cibusName: cibusNamesByWoltName.get(debt.woltName) }));
}

export function createMatchingPrompt(woltNames, cibusNames) {
    return `Match Wolt diners to Cibus users conservatively. Names may be Hebrew or English transliterations, have reversed first/last order, surname initials, or minor spelling differences. Only return a match when you are confident; never guess. Each name may appear at most once. Return JSON only, shaped as {"matches":[{"woltName":"exact Wolt name","cibusName":"exact Cibus name"}]}. Unmatched Wolt diners must be omitted.\nWolt diners: ${JSON.stringify(woltNames)}\nCibus users: ${JSON.stringify(cibusNames)}`;
}

function parseMatches(response) {
    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("INVALID_RESPONSE");
    try {
        const matches = JSON.parse(content).matches;
        if (!Array.isArray(matches)) throw new Error("INVALID_RESPONSE");
        return matches;
    } catch {
        throw new Error("INVALID_RESPONSE");
    }
}

export async function matchUnresolvedNames({ woltNames, cibusNames, apiKey, model, send, timeoutMs = 30_000 }) {
    if (activeRequest) throw new Error("MATCH_IN_PROGRESS");
    if (!apiKey || !model) throw new Error("MISSING_SETTINGS");
    if (!Array.isArray(woltNames) || !Array.isArray(cibusNames) || woltNames.length > MAX_NAMES || cibusNames.length > MAX_NAMES) {
        throw new Error("NAME_LIMIT_EXCEEDED");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    activeRequest = (async () => {
        const response = await (send || ((request) => new OpenRouter({ apiKey }).chat.send(request, {
            signal: controller.signal,
            retries: { strategy: "none" },
        })))({
            chatRequest: {
                model,
                stream: false,
                temperature: 0,
                messages: [{ role: "user", content: createMatchingPrompt(woltNames, cibusNames) }],
            },
        }, { signal: controller.signal });
        return validateMatches(woltNames, cibusNames, parseMatches(response));
    })();

    try {
        return await activeRequest;
    } finally {
        clearTimeout(timeout);
        activeRequest = undefined;
    }
}