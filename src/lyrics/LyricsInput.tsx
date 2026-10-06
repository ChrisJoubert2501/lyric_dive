import { useState } from "react";

interface LyricsInputProps {
  initialText?: string;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
}

export function LyricsInput({
  initialText = "",
  onSubmit,
  onCancel,
}: LyricsInputProps) {
  const [text, setText] = useState(initialText);

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
      <div className="actions">
        <button type="submit" disabled={text.trim().length === 0}>
          Use these lyrics
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
