import { useState } from "react";

interface LyricsInputProps {
  onSubmit: (text: string) => void;
}

export function LyricsInput({ onSubmit }: LyricsInputProps) {
  const [text, setText] = useState("");

  return (
    <form
      className="lyrics-input"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(text);
      }}
    >
      <label htmlFor="lyrics-text">Paste the lyrics, one line per row</label>
      <textarea
        id="lyrics-text"
        rows={14}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" disabled={text.trim().length === 0}>
        Use these lyrics
      </button>
    </form>
  );
}
