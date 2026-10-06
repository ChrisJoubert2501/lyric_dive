import type { LyricLine, LyricProject, SongMetadata } from "./model";

const SCHEMA_VERSION = 1;

export class ProjectFileError extends Error {}

export function serializeProject(project: LyricProject): string {
  return JSON.stringify(project, null, 2) + "\n";
}

/**
 * Project files can be edited by hand or written by other versions of the
 * app, so every field is checked before the editor relies on it. Unknown
 * fields are dropped.
 */
export function parseProject(json: string): LyricProject {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ProjectFileError("The file is not valid JSON.");
  }

  const root = object(data, "The project");
  const version = root.schemaVersion;
  if (typeof version === "number" && version > SCHEMA_VERSION) {
    throw new ProjectFileError(
      "This project was saved by a newer version of Lyric Dive.",
    );
  }
  if (version !== SCHEMA_VERSION) {
    throw new ProjectFileError(
      `Unsupported schemaVersion ${JSON.stringify(version)}.`,
    );
  }

  const metadata = object(root.metadata, "metadata");
  const lines = array(root.lines, "lines").map((line, index) =>
    parseLine(line, `lines[${index}]`),
  );
  const ids = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (ids.has(line.id)) {
      throw new ProjectFileError(`lines[${index}].id is used twice.`);
    }
    ids.add(line.id);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    audioPath: nullable(string)(root.audioPath, "audioPath"),
    metadata: {
      title: string(metadata.title, "metadata.title"),
      artist: string(metadata.artist, "metadata.artist"),
      album: string(metadata.album, "metadata.album"),
    },
    sourceLanguage: nullable(string)(root.sourceLanguage, "sourceLanguage"),
    lines,
  };
}

export function suggestedFileName(
  metadata: SongMetadata,
  extension: string,
): string {
  const name = [metadata.artist, metadata.title]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" - ");
  return `${(name || "Untitled").replace(/[\\/:*?"<>|]/g, "_")}${extension}`;
}

function parseLine(value: unknown, path: string): LyricLine {
  const line = object(value, path);
  const translations = object(line.translations, `${path}.translations`);
  return {
    id: nonEmptyString(line.id, `${path}.id`),
    text: string(line.text, `${path}.text`),
    startMs: nullable(milliseconds)(line.startMs, `${path}.startMs`),
    endMs: nullable(milliseconds)(line.endMs, `${path}.endMs`),
    translations: Object.fromEntries(
      Object.entries(translations).map(([language, text]) => [
        language,
        string(text, `${path}.translations.${language}`),
      ]),
    ),
  };
}

type Check<T> = (value: unknown, path: string) => T;

const string: Check<string> = (value, path) => {
  if (typeof value !== "string") throw invalid(path, "a string");
  return value;
};

const nonEmptyString: Check<string> = (value, path) => {
  if (typeof value !== "string" || value === "") {
    throw invalid(path, "a non-empty string");
  }
  return value;
};

const milliseconds: Check<number> = (value, path) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw invalid(path, "a whole number of milliseconds, 0 or more");
  }
  return value;
};

function nullable<T>(check: Check<T>): Check<T | null> {
  return (value, path) => (value === null ? null : check(value, path));
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid(path, "an object");
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw invalid(path, "a list");
  return value;
}

function invalid(path: string, expected: string): ProjectFileError {
  return new ProjectFileError(`${path} must be ${expected}.`);
}
