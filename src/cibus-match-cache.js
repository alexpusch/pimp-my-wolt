export const CIBUS_MATCH_CACHE_KEY = "woltToCibusMatches";

export function getCachedMatches(woltNames, cibusNames, cache) {
    const availableCibusNames = new Set(cibusNames);
    const assignedCibusNames = new Set();
    const cachedMatches = [];

    for (const woltName of woltNames) {
        const cibusName = cache?.[woltName];
        if (
            typeof cibusName === "string" &&
            availableCibusNames.has(cibusName) &&
            !assignedCibusNames.has(cibusName)
        ) {
            cachedMatches.push({ woltName, cibusName });
            assignedCibusNames.add(cibusName);
        }
    }

    return cachedMatches;
}

export function addMatchesToCache(cache, matches) {
    return {
        ...(cache && typeof cache === "object" ? cache : {}),
        ...Object.fromEntries(matches.map(({ woltName, cibusName }) => [woltName, cibusName])),
    };
}