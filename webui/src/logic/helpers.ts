// ABOUTME: Small stateless utilities: name-to-filename slugging, id generation,
// ABOUTME: a shuffle RNG seed, and the browser file-save helper for YAML export.

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deck';
}

export function newUid(): string {
  return crypto.randomUUID();
}

/** A u32-range seed for the wasm engine's seeded shuffle. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
