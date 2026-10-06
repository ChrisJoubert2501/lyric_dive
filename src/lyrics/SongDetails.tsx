import type { SongMetadata } from "./model";

const FIELDS: { field: keyof SongMetadata; label: string }[] = [
  { field: "title", label: "Title" },
  { field: "artist", label: "Artist" },
  { field: "album", label: "Album" },
];

interface SongDetailsProps {
  metadata: SongMetadata;
  onChange: (field: keyof SongMetadata, value: string) => void;
}

export function SongDetails({ metadata, onChange }: SongDetailsProps) {
  return (
    <section className="song-details">
      {FIELDS.map(({ field, label }) => (
        <label key={field}>
          {label}
          <input
            type="text"
            value={metadata[field]}
            onChange={(event) => onChange(field, event.target.value)}
          />
        </label>
      ))}
    </section>
  );
}
