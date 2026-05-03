const STOP_WORDS = new Set(["en", "de", "del", "la", "el", "los", "las", "una", "un", "y", "e", "o", "por", "para", "con"]);

function toTitleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((word, i) => {
      if (/^\([A-Z]{2,}\)$/.test(word)) return word;
      if (i > 0 && STOP_WORDS.has(word.toLowerCase())) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function normalizeCarrera(carrera: string): string {
  const trimmed = carrera?.trim();
  if (!trimmed || /^\d+$/.test(trimmed)) return "N/A";
  return toTitleCase(trimmed);
}
