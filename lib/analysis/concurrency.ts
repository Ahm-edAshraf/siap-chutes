export async function runConcurrently<T extends readonly unknown[]>(tasks: {
  [K in keyof T]: () => Promise<T[K]>;
}): Promise<T> {
  return (await Promise.all(tasks.map((task) => task()))) as unknown as T;
}
