export interface ParsedSlashCommand {
  name: string;
  args: string;
  raw: string;
}

export function parseSlashCommand(value: string): ParsedSlashCommand | null {
  const raw = value.trim();
  if (!raw.startsWith("/")) return null;
  const separator = raw.search(/\s/);
  return separator < 0
    ? { name: raw.slice(1).toLowerCase(), args: "", raw }
    : { name: raw.slice(1, separator).toLowerCase(), args: raw.slice(separator).trim(), raw };
}
