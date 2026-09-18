import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { matchUnresolvedNames } from "../src/openrouter-matcher.js";

test("OpenRouter conservatively matches the synthetic bilingual fixture", { timeout: 35_000 }, async () => {
    if (!process.env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY is required for this paid integration test");
    }
    const fixture = JSON.parse(await readFile("tests/fixtures/openrouter-names.json", "utf8"));
    const matches = await matchUnresolvedNames({
        woltNames: fixture.woltNames,
        cibusNames: fixture.cibusNames,
        apiKey: process.env.OPENROUTER_API_KEY,
        model: 'openai/gpt-5.6-luna',
    });

    assert.deepEqual(matches, fixture.expectedMatches);
});