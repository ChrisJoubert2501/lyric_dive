export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** E.g. `/music/song.mp3` with `.lrc` becomes `/music/song.lrc`. */
export function withExtension(path: string, extension: string): string {
  const name = fileName(path);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? path.slice(0, path.length - name.length + dot) : path;
  return stem + extension;
}
