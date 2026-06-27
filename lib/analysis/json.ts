export function extractJson(value: string): unknown {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = Math.min(
      ...[candidate.indexOf("{"), candidate.indexOf("[")].filter(
        (index) => index >= 0,
      ),
    );
    const end = Math.max(
      candidate.lastIndexOf("}"),
      candidate.lastIndexOf("]"),
    );
    if (!Number.isFinite(start) || end <= start)
      throw new Error("No JSON object found");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}
