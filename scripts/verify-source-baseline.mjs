import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "reference", "commercial-los-source");
const required = [
  "SPEC.md",
  "package.json",
  "src/App.tsx",
  "src/main.tsx",
  "src/workspaces/BankerWorkspace.tsx",
  "src/workspaces/ManagerWorkspace.tsx",
  "src/workspaces/ExecutiveWorkspace.tsx",
  "src/workspaces/AdminWorkspace.tsx",
  "src/deals/DealRoute.tsx",
];

for (const path of required) {
  if (!existsSync(join(root, path))) throw new Error(`Source baseline is missing ${path}`);
}

function countFiles(path) {
  return readdirSync(path).reduce((count, name) => {
    const child = join(path, name);
    return count + (statSync(child).isDirectory() ? countFiles(child) : 1);
  }, 0);
}

const count = countFiles(root);
if (count !== 2929) throw new Error(`Source baseline file count changed: expected 2929, received ${count}`);
console.log(`Source baseline verified: ${count} files at source commit 9f4d14816938417bd0869ad7b6e0471737495b2a`);
