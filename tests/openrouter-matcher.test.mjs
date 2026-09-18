import test from "node:test";
import assert from "node:assert/strict";

import { addMatchesToCache, getCachedMatches } from "../src/cibus-match-cache.js";
import { applyMatchesToDebts, DEFAULT_OPENROUTER_MODEL, matchUnresolvedNames, resolveOpenRouterModel, validateMatches } from "../src/openrouter-matcher.js";

test("reuses only cached matches that remain valid and one-to-one", () => {
    const cachedMatches = getCachedMatches(
        ["Dana Cohen", "Yoav Levi", "New Guest"],
        ["Dana C.", "Yoav L."],
        {
            "Dana Cohen": "Dana C.",
            "Yoav Levi": "Dana C.",
            "Former Guest": "Missing Cibus User",
        }
    );

    assert.deepEqual(cachedMatches, [{ woltName: "Dana Cohen", cibusName: "Dana C." }]);
});

test("adds newly resolved matches without discarding existing cache entries", () => {
    const cache = addMatchesToCache(
        { "Dana Cohen": "Dana C." },
        [{ woltName: "Yoav Levi", cibusName: "Yoav L." }]
    );

    assert.deepEqual(cache, {
        "Dana Cohen": "Dana C.",
        "Yoav Levi": "Yoav L.",
    });
});

test("keeps only one-to-one matches from known Wolt and Cibus names", () => {
    const matches = validateMatches(
        ["Dana Cohen", "יואב לוי", "Maya Ben David"],
        ["כהן דנה", "Yoav Levi", "Maya B. David"],
        [
            { woltName: "Dana Cohen", cibusName: "כהן דנה" },
            { woltName: "יואב לוי", cibusName: "Yoav Levi" },
            { woltName: "Maya Ben David", cibusName: "Maya B. David" },
        ]
    );

    assert.deepEqual(matches, [
        { woltName: "Dana Cohen", cibusName: "כהן דנה" },
        { woltName: "יואב לוי", cibusName: "Yoav Levi" },
        { woltName: "Maya Ben David", cibusName: "Maya B. David" },
    ]);
});

test("uses the Luna model as the default OpenRouter model", () => {
    assert.equal(DEFAULT_OPENROUTER_MODEL, "openai/gpt-5.6-luna");
    assert.equal(resolveOpenRouterModel(""), DEFAULT_OPENROUTER_MODEL);
    assert.equal(resolveOpenRouterModel("  provider/custom "), "provider/custom");
});

test("accepts model results for transliteration, reordered names, surname initials, and spelling variants", () => {
    const matches = validateMatches(
        ["Dana Cohen", "יואב לוי", "Maya Ben David", "Unmatched Person"],
        ["Dana C.", "Levi Yoav", "Maya Ben-David", "Decoy Person"],
        [
            { woltName: "Dana Cohen", cibusName: "Dana C." },
            { woltName: "יואב לוי", cibusName: "Levi Yoav" },
            { woltName: "Maya Ben David", cibusName: "Maya Ben-David" },
        ]
    );

    assert.equal(matches.length, 3);
});

test("applies valid partial matches without selecting unmatched debts", () => {
    const matchedDebts = applyMatchesToDebts(
        [{ woltName: "Dana Cohen", debt: 30 }, { woltName: "Unmatched Person", debt: 20 }],
        [{ woltName: "Dana Cohen", cibusName: "Dana C." }]
    );

    assert.deepEqual(matchedDebts, [{ woltName: "Dana Cohen", cibusName: "Dana C.", debt: 30 }]);
});

test("rejects unknown and duplicate assignments", () => {
    const matches = validateMatches(
        ["Dana Cohen", "Yoav Levi"],
        ["Dana C", "Yoav L"],
        [
            { woltName: "Dana Cohen", cibusName: "Dana C" },
            { woltName: "Yoav Levi", cibusName: "Dana C" },
            { woltName: "Unknown", cibusName: "Yoav L" },
        ]
    );

    assert.deepEqual(matches, []);
});

test("returns valid partial results from an injected transport", async () => {
    const matches = await matchUnresolvedNames({
        woltNames: ["Dana Cohen", "No Match"],
        cibusNames: ["כהן דנה", "Decoy"],
        apiKey: "test-key",
        model: "test/model",
        send: async () => ({
            choices: [{ message: { content: '{"matches":[{"woltName":"Dana Cohen","cibusName":"כהן דנה"}]}' } }],
        }),
    });

    assert.deepEqual(matches, [{ woltName: "Dana Cohen", cibusName: "כהן דנה" }]);
});

test("rejects malformed provider output", async () => {
    await assert.rejects(
        matchUnresolvedNames({
            woltNames: ["Dana Cohen"], cibusNames: ["כהן דנה"], apiKey: "test-key", model: "test/model",
            send: async () => ({ choices: [{ message: { content: "not json" } }] }),
        }),
        { message: "INVALID_RESPONSE" }
    );
});

test("enforces name bounds before the transport is called", async () => {
    let called = false;
    await assert.rejects(
        matchUnresolvedNames({
            woltNames: Array.from({ length: 51 }, (_, index) => `Wolt ${index}`),
            cibusNames: [], apiKey: "test-key", model: "test/model", send: async () => { called = true; },
        }),
        { message: "NAME_LIMIT_EXCEEDED" }
    );
    assert.equal(called, false);
});

test("allows only one matching request at a time", async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const first = matchUnresolvedNames({
        woltNames: ["Dana Cohen"], cibusNames: ["כהן דנה"], apiKey: "test-key", model: "test/model",
        send: async () => { await pending; return { choices: [{ message: { content: '{"matches":[]}' } }] }; },
    });
    await assert.rejects(
        matchUnresolvedNames({ woltNames: [], cibusNames: [], apiKey: "test-key", model: "test/model", send: async () => ({}) }),
        { message: "MATCH_IN_PROGRESS" }
    );
    release();
    await first;
});

test("aborts a request that exceeds its timeout", async () => {
    await assert.rejects(
        matchUnresolvedNames({
            woltNames: ["Dana Cohen"], cibusNames: ["כהן דנה"], apiKey: "test-key", model: "test/model", timeoutMs: 1,
            send: (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("timed out"), { name: "AbortError" })))),
        }),
        { name: "AbortError" }
    );
});