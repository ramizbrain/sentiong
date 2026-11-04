/** `/Users/octo/code/app` → `~/code/app` when `home` is `/Users/octo`. */
export function shortenPath(path: string, home: string): string {
  if (!home) return path;
  const normalizedHome = home.replace(/[\\/]+$/, "");
  if (path === normalizedHome) return "~";
  if (path.startsWith(`${normalizedHome}/`) || path.startsWith(`${normalizedHome}\\`)) {
    return `~${path.slice(normalizedHome.length)}`;
  }
  return path;
}

/** The last folder name of a path. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** Up to two letters for an avatar: `"Work Stuff"` → `"WS"`. */
export function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

/** A short, recognizable piece of a public key: `"ssh-ed25519 …Ab12Cd"`. */
export function shortKey(publicKey: string): string {
  const [type, body = ""] = publicKey.split(/\s+/);
  return body.length > 8 ? `${type} …${body.slice(-8)}` : publicKey;
}

/** `"1 repository"`, `"3 repositories"`. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
