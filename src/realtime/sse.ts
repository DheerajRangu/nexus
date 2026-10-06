export interface SseFrame {
  event: string;
  id?: string;
  data: string;
}

export function parseSseBuffer(buffer: string): { rest: string; frames: SseFrame[] } {
  const chunks = buffer.split(/\n\n/);
  const rest = chunks.pop() ?? "";
  const frames: SseFrame[] = [];
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    let event = "message";
    let id: string | undefined;
    const dataLines: string[] = [];
    for (const line of chunk.split(/\n/)) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("id:")) id = line.slice(3).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (dataLines.length) frames.push({ event, id, data: dataLines.join("\n") });
  }
  return { rest, frames };
}
