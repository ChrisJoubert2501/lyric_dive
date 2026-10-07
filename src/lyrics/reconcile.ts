import type { LyricLine } from "./model";

/**
 * Carries the timing, translations and ID of each previous line over to its
 * counterpart in `next`, so that replacing the lyrics with a corrected
 * version keeps the work already done on them. Returned lines take their
 * text from `next`.
 *
 * Lines are matched like a diff: the longest run of lines that appear in the
 * same order in both. Order matters because lyrics repeat; matching each line
 * to any line with the same text could give the second chorus the first
 * chorus's timestamps. Between two matched lines, the remaining lines are
 * paired in order when there are as many before as after, which is how a
 * reworded line keeps its timestamp. When the counts differ, there is no
 * reliable pairing, and the new lines start untimed.
 */
export function reconcileLines(
  previous: LyricLine[],
  next: LyricLine[],
): LyricLine[] {
  const result = [...next];
  const keep = (from: number, to: number) => {
    result[to] = { ...previous[from], text: next[to].text };
  };

  const matches = commonSubsequence(
    previous.map((line) => comparable(line.text)),
    next.map((line) => comparable(line.text)),
  );
  let from = 0;
  let to = 0;
  for (const [matchFrom, matchTo] of [
    ...matches,
    [previous.length, next.length],
  ]) {
    if (matchFrom - from === matchTo - to) {
      for (let offset = 0; offset < matchFrom - from; offset++) {
        keep(from + offset, to + offset);
      }
    }
    if (matchFrom < previous.length) keep(matchFrom, matchTo);
    from = matchFrom + 1;
    to = matchTo + 1;
  }
  return result;
}

/**
 * Ignores case, punctuation and spacing, so that tidying a line does not
 * count as changing it. Lines without letters or digits, e.g. "♪", are
 * compared as they are.
 */
function comparable(text: string): string {
  const words = text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return words || text;
}

/**
 * Returns the index pairs of a longest common subsequence of `a` and `b`, in
 * order. Songs have at most a few hundred lines, so the quadratic table is
 * small.
 */
function commonSubsequence(a: string[], b: string[]): [number, number][] {
  // lengths[i][j] is the length of the longest common subsequence of a[i..]
  // and b[j..].
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] =
        a[i] === b[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}
