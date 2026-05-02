const STOP_WORDS = new Set(["en", "de", "del", "la", "el", "los", "las", "una", "un", "y", "e", "o", "por", "para", "con"]);

function toTitleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((word, i) =>
      i > 0 && STOP_WORDS.has(word.toLowerCase())
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
}

export function normalizeCarrera(carrera: string): string {
  if (!carrera?.trim()) return "";
  return toTitleCase(carrera.trim());
}
