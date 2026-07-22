export function relativeTime(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.floor(hours / 24)}일 전`;
}

export function homeRelativePath(value: string, home = process.env.HOME ?? ""): string {
  return home && value.startsWith(home) ? `~${value.slice(home.length)}` : value;
}

export function messageText(message: { content?: unknown }): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map((part) => typeof part === "string" ? part : ((part as { text?: string })?.text ?? "")).join(" ");
  }
  return "";
}
