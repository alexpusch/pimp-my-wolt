const MIN_MATCH_SCORE = 80;
const MIN_SCORE_MARGIN = 5;
const TITLE_TOKENS = new Set(["dr", "mr", "mrs", "ms", "prof", "מר", "גברת"]);
const HEBREW_FINAL_LETTERS = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };
const HEBREW_SKELETON = {
    א: "", ב: "b", ג: "g", ד: "d", ה: "h", ו: "b", ז: "z", ח: "h", ט: "t",
    י: "y", כ: "k", ל: "l", מ: "m", נ: "n", ס: "s", ע: "", פ: "p", צ: "z",
    ק: "k", ר: "r", ש: "s", ת: "t",
};

function normalizeName(name) {
    if (typeof name !== "string") return { value: "", tokens: [] };

    const value = name
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLocaleLowerCase()
        .replace(/ד["״']?ר/gu, " ")
        .replace(/[ךםןףץ]/gu, (letter) => HEBREW_FINAL_LETTERS[letter])
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    const tokens = value.split(/\s+/).filter((token) => token && !TITLE_TOKENS.has(token));
    return { value: tokens.join(" "), tokens };
}

function damerauLevenshtein(left, right) {
    const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
    for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
    for (let column = 0; column <= right.length; column += 1) matrix[0][column] = column;

    for (let row = 1; row <= left.length; row += 1) {
        for (let column = 1; column <= right.length; column += 1) {
            const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
            matrix[row][column] = Math.min(
                matrix[row - 1][column] + 1,
                matrix[row][column - 1] + 1,
                matrix[row - 1][column - 1] + substitutionCost
            );
            if (
                row > 1 && column > 1 &&
                left[row - 1] === right[column - 2] &&
                left[row - 2] === right[column - 1]
            ) {
                matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
            }
        }
    }

    return matrix[left.length][right.length];
}

function jaroWinkler(left, right) {
    if (left === right) return 1;
    if (!left.length || !right.length) return 0;

    const range = Math.max(0, Math.floor(Math.max(left.length, right.length) / 2) - 1);
    const leftMatches = Array(left.length).fill(false);
    const rightMatches = Array(right.length).fill(false);
    let matches = 0;

    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
        const start = Math.max(0, leftIndex - range);
        const end = Math.min(leftIndex + range + 1, right.length);
        for (let rightIndex = start; rightIndex < end; rightIndex += 1) {
            if (rightMatches[rightIndex] || left[leftIndex] !== right[rightIndex]) continue;
            leftMatches[leftIndex] = true;
            rightMatches[rightIndex] = true;
            matches += 1;
            break;
        }
    }
    if (!matches) return 0;

    const matchedLeft = left.split("").filter((_, index) => leftMatches[index]);
    const matchedRight = right.split("").filter((_, index) => rightMatches[index]);
    const transpositions = matchedLeft.filter((character, index) => character !== matchedRight[index]).length / 2;
    const jaro = (
        matches / left.length + matches / right.length + (matches - transpositions) / matches
    ) / 3;
    let prefixLength = 0;
    while (prefixLength < 4 && left[prefixLength] === right[prefixLength]) prefixLength += 1;
    return jaro + prefixLength * 0.1 * (1 - jaro);
}

function maximumWeightAssignment(weights) {
    const rowCount = weights.length;
    const columnCount = weights[0]?.length || 0;
    if (!rowCount || !columnCount) return Array(rowCount).fill(-1);

    const size = Math.max(rowCount, columnCount);
    const maxWeight = Math.max(0, ...weights.flat());
    const rowPotential = Array(size + 1).fill(0);
    const columnPotential = Array(size + 1).fill(0);
    const matchedRow = Array(size + 1).fill(0);
    const previousColumn = Array(size + 1).fill(0);

    for (let row = 1; row <= size; row += 1) {
        matchedRow[0] = row;
        let column = 0;
        const minimumCost = Array(size + 1).fill(Infinity);
        const used = Array(size + 1).fill(false);

        do {
            used[column] = true;
            const currentRow = matchedRow[column];
            let delta = Infinity;
            let nextColumn = 0;
            for (let candidateColumn = 1; candidateColumn <= size; candidateColumn += 1) {
                if (used[candidateColumn]) continue;
                const weight = weights[currentRow - 1]?.[candidateColumn - 1] || 0;
                const cost = maxWeight - weight - rowPotential[currentRow] - columnPotential[candidateColumn];
                if (cost < minimumCost[candidateColumn]) {
                    minimumCost[candidateColumn] = cost;
                    previousColumn[candidateColumn] = column;
                }
                if (minimumCost[candidateColumn] < delta) {
                    delta = minimumCost[candidateColumn];
                    nextColumn = candidateColumn;
                }
            }
            for (let candidateColumn = 0; candidateColumn <= size; candidateColumn += 1) {
                if (used[candidateColumn]) {
                    rowPotential[matchedRow[candidateColumn]] += delta;
                    columnPotential[candidateColumn] -= delta;
                } else {
                    minimumCost[candidateColumn] -= delta;
                }
            }
            column = nextColumn;
        } while (matchedRow[column] !== 0);

        do {
            const nextColumn = previousColumn[column];
            matchedRow[column] = matchedRow[nextColumn];
            column = nextColumn;
        } while (column !== 0);
    }

    const assignment = Array(rowCount).fill(-1);
    for (let column = 1; column <= size; column += 1) {
        if (matchedRow[column] <= rowCount && column <= columnCount) {
            assignment[matchedRow[column] - 1] = column - 1;
        }
    }
    return assignment;
}

function matchedTokenScores(leftTokens, rightTokens, tokenScore) {
    if (leftTokens.length !== rightTokens.length || !leftTokens.length) return [];
    const scores = leftTokens.map((leftToken) => rightTokens.map((rightToken) => tokenScore(leftToken, rightToken)));
    const assignment = maximumWeightAssignment(scores);
    return assignment.map((column, row) => column >= 0 ? scores[row][column] : 0);
}

function sameTokens(leftTokens, rightTokens) {
    const sortedRightTokens = [...rightTokens].sort();
    return leftTokens.length === rightTokens.length &&
        [...leftTokens].sort().every((token, index) => token === sortedRightTokens[index]);
}

function initialTokenScore(left, right) {
    if (left === right) return 1;
    if (left.length === 1 && right.startsWith(left)) return 0.85;
    if (right.length === 1 && left.startsWith(right)) return 0.85;
    return 0;
}

function fuzzyTokenScore(left, right) {
    if (left === right) return 1;
    const longestLength = Math.max(left.length, right.length);
    if (Math.min(left.length, right.length) <= 4) return 0;
    const distance = damerauLevenshtein(left, right);
    const maximumDistance = longestLength <= 7 ? 1 : 2;
    if (distance > maximumDistance) return 0;
    return Math.max(1 - distance / longestLength, jaroWinkler(left, right));
}

function latinSkeleton(token) {
    const replacements = token
        .replace(/sh/g, "s")
        .replace(/(?:ch|kh)/g, "h")
        .replace(/(?:ts|tz)/g, "z")
        .replace(/ph/g, "p");
    return [...replacements]
        .map((character) => {
            if ("aeiou".includes(character)) return "";
            if ("bv".includes(character)) return "b";
            if ("pf".includes(character)) return "p";
            if ("ckq".includes(character)) return "k";
            return character;
        })
        .join("")
        .replace(/(.)\1+/g, "$1");
}

function hebrewSkeleton(token) {
    return [...token].map((character) => HEBREW_SKELETON[character] ?? character).join("").replace(/(.)\1+/g, "$1");
}

function transliterationTokenScore(left, right) {
    const leftIsHebrew = /\p{Script=Hebrew}/u.test(left);
    const rightIsHebrew = /\p{Script=Hebrew}/u.test(right);
    if (leftIsHebrew === rightIsHebrew) return 0;

    const leftSkeleton = leftIsHebrew ? hebrewSkeleton(left) : latinSkeleton(left);
    const rightSkeleton = rightIsHebrew ? hebrewSkeleton(right) : latinSkeleton(right);
    if (Math.min(leftSkeleton.length, rightSkeleton.length) < 2) return 0;
    const distance = damerauLevenshtein(leftSkeleton, rightSkeleton);
    if (distance > 1) return 0;
    return distance === 0 ? 1 : 0.8;
}

function scoreNames(left, right) {
    if (!left.tokens.length || !right.tokens.length) return 0;
    if (left.value === right.value) return 100;
    if (sameTokens(left.tokens, right.tokens)) return 94;

    const initialScores = matchedTokenScores(left.tokens, right.tokens, initialTokenScore);
    if (initialScores.length && initialScores.every(Boolean) && initialScores.some((score) => score < 1)) return 88;

    if (Math.abs(left.tokens.length - right.tokens.length) === 1) {
        const shorterTokens = left.tokens.length < right.tokens.length ? left.tokens : right.tokens;
        const longerTokens = left.tokens.length < right.tokens.length ? right.tokens : left.tokens;
        if (shorterTokens.every((token) => longerTokens.includes(token))) return 84;
    }

    const fuzzyScores = matchedTokenScores(left.tokens, right.tokens, fuzzyTokenScore);
    if (fuzzyScores.length && fuzzyScores.every(Boolean) && fuzzyScores.some((score) => score < 1)) {
        return 80 + fuzzyScores.reduce((sum, score) => sum + score, 0) / fuzzyScores.length * 8;
    }

    const transliterationScores = matchedTokenScores(left.tokens, right.tokens, transliterationTokenScore);
    if (transliterationScores.length && transliterationScores.every(Boolean)) {
        return 80 + transliterationScores.reduce((sum, score) => sum + score, 0) / transliterationScores.length * 4;
    }

    return 0;
}

function hasClearLead(scores, index) {
    const sortedScores = [...scores].sort((left, right) => right - left);
    return scores[index] >= MIN_MATCH_SCORE && (sortedScores.length === 1 || scores[index] - sortedScores[1] >= MIN_SCORE_MARGIN);
}

export function matchNamesHeuristically(woltNames, cibusNames) {
    const normalizedWoltNames = woltNames.map(normalizeName);
    const normalizedCibusNames = cibusNames.map(normalizeName);
    const scores = normalizedWoltNames.map((woltName) =>
        normalizedCibusNames.map((cibusName) => scoreNames(woltName, cibusName))
    );
    const eligibleScores = scores.map((row, rowIndex) => row.map((score, columnIndex) => {
        const column = scores.map((candidateRow) => candidateRow[columnIndex]);
        return hasClearLead(row, columnIndex) && hasClearLead(column, rowIndex) ? score : 0;
    }));
    const assignment = maximumWeightAssignment(eligibleScores);

    return assignment.flatMap((columnIndex, rowIndex) =>
        columnIndex >= 0 && eligibleScores[rowIndex][columnIndex] > 0
            ? [{ woltName: woltNames[rowIndex], cibusName: cibusNames[columnIndex] }]
            : []
    );
}