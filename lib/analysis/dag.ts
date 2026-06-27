export function validateActionDag(
  actions: Array<{ key: string; dependsOn: string[] }>,
) {
  const keys = new Set<string>();
  for (const action of actions) {
    if (keys.has(action.key))
      throw new Error(`Duplicate action key: ${action.key}`);
    keys.add(action.key);
  }
  const graph = new Map(actions.map((item) => [item.key, item.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string) => {
    if (visiting.has(key))
      throw new Error("Action dependencies contain a cycle");
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of graph.get(key) ?? []) {
      if (!keys.has(dependency)) {
        throw new Error(`Unknown action dependency: ${dependency}`);
      }
      visit(dependency);
    }
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of keys) visit(key);
  return true;
}
