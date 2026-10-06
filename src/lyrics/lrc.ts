import {
  createLine,
  type LyricLine,
  type LyricProject,
  type SongMetadata,
} from "./model";

export interface ParsedLrc {
  metadata: Partial<SongMetadata>;
  lines: LyricLine[];
}

const LEADING_TAGS = /^((?:\[[^\]]*\])+)(.*)$/;
const TAG = /\[([^\]]*)\]/g;
const TIMESTAMP = /^(\d+):(\d{1,2})(?:[.:](\d{1,3}))?$/;
const ID_TAG = /^([a-zA-Z]+):(.*)$/;

const METADATA_TAGS: Record<string, keyof SongMetadata> = {
  ti: "title",
  ar: "artist",
  al: "album",
};

export function parseLrc(source: string): ParsedLrc {
  const metadata: Partial<SongMetadata> = {};
  const entries: { timeMs: number; text: string }[] = [];
  let offsetMs = 0;

  for (const rawLine of source.split(/\r?\n/)) {
    const match = LEADING_TAGS.exec(rawLine.trim());
    if (!match) continue;

    const [, tagBlock, rest] = match;
    const text = rest.trim();
    const timestamps: number[] = [];

    for (const [, tag] of tagBlock.matchAll(TAG)) {
      const time = TIMESTAMP.exec(tag);
      if (time) {
        const [, minutes, seconds, fraction = ""] = time;
        timestamps.push(
          Number(minutes) * 60_000 +
            Number(seconds) * 1000 +
            Number(fraction.padEnd(3, "0")),
        );
        continue;
      }

      const idTag = ID_TAG.exec(tag);
      if (!idTag) continue;
      const key = idTag[1].toLowerCase();
      const value = idTag[2].trim();
      if (key === "offset") {
        offsetMs = Number(value) || 0;
      } else if (key in METADATA_TAGS) {
        metadata[METADATA_TAGS[key]] = value;
      }
    }

    for (const timeMs of timestamps) {
      entries.push({ timeMs, text });
    }
  }

  // A positive LRC offset makes lyrics appear earlier.
  const adjusted = entries
    .map((entry) => ({
      ...entry,
      timeMs: Math.max(0, entry.timeMs - offsetMs),
    }))
    .sort((a, b) => a.timeMs - b.timeMs);

  const lines: LyricLine[] = [];
  for (const { timeMs, text } of adjusted) {
    if (text.length > 0) {
      lines.push(createLine(text, timeMs));
      continue;
    }
    const previous = lines.at(-1);
    if (previous && previous.endMs === null) {
      previous.endMs = timeMs;
    }
  }

  return { metadata, lines };
}

/**
 * Untimed lines are omitted because LRC has no way to represent them.
 * Timestamps are written in hundredths of a second, so millisecond precision
 * is rounded to the nearest 10 ms.
 */
export function serializeLrc(
  project: Pick<LyricProject, "metadata" | "lines">,
): string {
  const output: string[] = [];

  for (const [tag, field] of Object.entries(METADATA_TAGS)) {
    const value = project.metadata[field].trim();
    if (value) output.push(`[${tag}:${value}]`);
  }

  const timed = project.lines
    .filter(
      (line): line is LyricLine & { startMs: number } => line.startMs !== null,
    )
    .sort((a, b) => a.startMs - b.startMs);

  timed.forEach((line, index) => {
    output.push(`[${formatLrcTimestamp(line.startMs)}]${line.text}`);
    const next = timed[index + 1];
    if (line.endMs !== null && (!next || line.endMs < next.startMs)) {
      output.push(`[${formatLrcTimestamp(line.endMs)}]`);
    }
  });

  return output.join("\n") + "\n";
}

export function formatLrcTimestamp(ms: number): string {
  const totalHundredths = Math.round(ms / 10);
  const minutes = Math.floor(totalHundredths / 6000);
  const seconds = Math.floor((totalHundredths % 6000) / 100);
  const hundredths = totalHundredths % 100;
  return `${pad(minutes)}:${pad(seconds)}.${pad(hundredths)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
