import { expect, test } from "vitest";
import { runConcurrently } from "@/lib/analysis/concurrency";

test("starts every ensemble task before waiting for completion", async () => {
  const started: string[] = [];
  const releases: Array<() => void> = [];
  const task = (name: string) => async () => {
    started.push(name);
    await new Promise<void>((resolve) => releases.push(resolve));
    return name;
  };

  const result = runConcurrently([
    task("compiler"),
    task("mapper"),
    task("reviewer"),
    task("planner"),
  ]);
  await Promise.resolve();
  expect(started).toEqual(["compiler", "mapper", "reviewer", "planner"]);
  releases.forEach((release) => release());
  await expect(result).resolves.toEqual([
    "compiler",
    "mapper",
    "reviewer",
    "planner",
  ]);
});
