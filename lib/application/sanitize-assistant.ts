export function sanitizeAssistantContent(content: string, allowedUrls: ReadonlySet<string>) {
  return content
    .replace(/!\[[^\]]*\]\([^)]*$/g, "")
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/gi, (match, _alt: string, url: string) => allowedUrls.has(url) ? match : "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, (match, label: string, url: string) => allowedUrls.has(url) ? match : label)
    .replace(/https?:\/\/[^\s)]+/gi, (url: string) => allowedUrls.has(url) ? url : "");
}
