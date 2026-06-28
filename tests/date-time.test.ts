import { describe, expect, test } from "vitest";
import {
  formatCalendarDate,
  formatDeadline,
  formatMalaysiaTimestamp,
  normalizeDeadline,
} from "@/lib/date-time";

describe("Malaysia date presentation", () => {
  test("formats local ISO deadlines as labeled 12-hour Malaysia time", () => {
    expect(formatDeadline("2026-09-30T23:59:00")).toBe(
      "30 September 2026 at 11:59 PM (Malaysia time)",
    );
    expect(formatDeadline("2026-09-30T15:59:00.000Z")).toBe(
      "30 September 2026 at 11:59 PM (Malaysia time)",
    );
  });

  test("normalizes old model formats without inventing a missing time", () => {
    expect(
      formatDeadline("30 September 2026, 11:59 PM MYT"),
    ).toBe("30 September 2026 at 11:59 PM (Malaysia time)");
    expect(formatDeadline("2026-09-30")).toBe(
      "30 September 2026 (time not stated)",
    );
    expect(normalizeDeadline("2026-09-30T23:59:00")).toBe(
      "2026-09-30T15:59:00.000Z",
    );
  });

  test("formats target and inventory dates consistently", () => {
    expect(formatCalendarDate("2026-09-09")).toBe("9 September 2026");
    expect(formatMalaysiaTimestamp(Date.UTC(2026, 8, 30, 15, 59))).toBe(
      "30 September 2026 at 11:59 PM (Malaysia time)",
    );
  });
});
