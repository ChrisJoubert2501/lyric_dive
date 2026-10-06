export type LineId = string;

/** BCP 47 language tag, e.g. "en", "pt-BR". */
export type LanguageCode = string;

export interface LyricLine {
  id: LineId;
  text: string;
  startMs: number | null;
  /**
   * Only set when the line should disappear before the next line starts
   * (e.g. ahead of an instrumental break). Otherwise the next line's start
   * implicitly ends it.
   */
  endMs: number | null;
  translations: Record<LanguageCode, string>;
}

export interface SongMetadata {
  title: string;
  artist: string;
  album: string;
}

export interface LyricProject {
  /** Bumped whenever the persisted shape changes, so old project files can be migrated on load. */
  schemaVersion: 1;
  audioPath: string | null;
  metadata: SongMetadata;
  sourceLanguage: LanguageCode | null;
  lines: LyricLine[];
}

export function createLine(
  text: string,
  startMs: number | null = null,
): LyricLine {
  return {
    id: crypto.randomUUID(),
    text,
    startMs,
    endMs: null,
    translations: {},
  };
}

export function createProject(
  metadata: Partial<SongMetadata> = {},
): LyricProject {
  return {
    schemaVersion: 1,
    audioPath: null,
    metadata: { title: "", artist: "", album: "", ...metadata },
    sourceLanguage: null,
    lines: [],
  };
}

export function linesFromText(text: string): LyricLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => createLine(line));
}

/**
 * Returns the line that should be highlighted at `positionMs`, assuming
 * `lines` is in song order. A linear scan is deliberate: songs have tens of
 * lines, and unlike a binary search it tolerates out-of-order timestamps
 * while the user is still editing.
 */
export function findActiveLine(
  lines: LyricLine[],
  positionMs: number,
): LyricLine | null {
  let active: LyricLine | null = null;
  for (const line of lines) {
    if (line.startMs !== null && line.startMs <= positionMs) {
      active = line;
    }
  }
  if (active?.endMs != null && positionMs >= active.endMs) {
    return null;
  }
  return active;
}
