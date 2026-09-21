import test from "node:test";
import assert from "node:assert/strict";

import { matchNamesHeuristically } from "../src/heuristic-matcher.js";

function match(woltName, cibusName) {
    return matchNamesHeuristically([woltName], [cibusName]);
}

test("matches exact names without regard to casing or whitespace", () => {
    assert.deepEqual(match("  Dana   Cohen ", "dana cohen"), [
        { woltName: "  Dana   Cohen ", cibusName: "dana cohen" },
    ]);
});

test("normalizes punctuation and hyphenated compound names", () => {
    assert.equal(match("Maya Ben David", "Maya Ben-David").length, 1);
});

test("normalizes Hebrew final letters", () => {
    assert.equal(match("מלכ", "מלך").length, 1);
});

test("ignores common English and Hebrew titles", () => {
    assert.equal(match("Dr. Dana Cohen", "Dana Cohen").length, 1);
    assert.equal(match("ד\"ר דנה כהן", "דנה כהן").length, 1);
});

test("matches reordered whole-name tokens", () => {
    assert.deepEqual(match("Dana Cohen", "Cohen, DANA"), [
        [{ woltName: "Dana Cohen", cibusName: "Cohen, DANA" }]
    ].flat());
});

test("matches surname and first-name initials", () => {
    assert.equal(match("Dana Cohen", "Dana C.").length, 1);
    assert.equal(match("Dana Cohen", "D. Cohen").length, 1);
});

test("matches a single extra middle name", () => {
    assert.equal(match("John Smith", "John Adam Smith").length, 1);
});

test("matches one-character typos and transpositions in longer tokens", () => {
    assert.equal(match("Michael Cohen", "Micheal Cohen").length, 1);
    assert.equal(match("Jonathan Smith", "Jonathon Smith").length, 1);
});

test("allows up to two edits only in long tokens", () => {
    assert.equal(match("Alexanderson", "Aleksanderson").length, 1);
    assert.deepEqual(match("Michael", "Mikael"), []);
});

test("does not fuzzy-match short names", () => {
    assert.deepEqual(match("Dan Cohen", "Don Cohen"), []);
});

test("compares whole tokens instead of substrings", () => {
    assert.deepEqual(match("Eli Cohen", "Elinor Cohen"), []);
});

test("matches conservative Hebrew and Latin transliterations", () => {
    assert.equal(match("יואב לוי", "Levi Yoav").length, 1);
    assert.equal(match("כהן דנה", "Dana Cohen").length, 1);
});

test("rejects unrelated cross-script names", () => {
    assert.deepEqual(match("יואב לוי", "Dana Cohen"), []);
});

test("omits a Wolt name when multiple candidates are similarly plausible", () => {
    assert.deepEqual(matchNamesHeuristically(["Dana Cohen"], ["Dana C.", "D. Cohen"]), []);
});

test("omits a Cibus name when multiple Wolt names are similarly plausible", () => {
    assert.deepEqual(matchNamesHeuristically(["Dana Cohen", "Dalia Cohen"], ["D. Cohen"]), []);
});

test("prioritizes exact matches over weaker candidates", () => {
    assert.deepEqual(matchNamesHeuristically(["Dana Cohen"], ["Cohen Dana", "Dana Cohen"]), [
        { woltName: "Dana Cohen", cibusName: "Dana Cohen" },
    ]);
});

test("produces one-to-one assignments and prioritizes an exact duplicate", () => {
    assert.deepEqual(matchNamesHeuristically(["Dana Cohen", "cohen dana"], ["Dana Cohen"]), [
        { woltName: "Dana Cohen", cibusName: "Dana Cohen" },
    ]);
});

test("returns only confident matches from a mixed list", () => {
    assert.deepEqual(matchNamesHeuristically(
        ["Dana Cohen", "Michael Smith", "No Match"],
        ["Cohen Dana", "Micheal Smith", "Someone Else"]
    ), [
        { woltName: "Dana Cohen", cibusName: "Cohen Dana" },
        { woltName: "Michael Smith", cibusName: "Micheal Smith" },
    ]);
});