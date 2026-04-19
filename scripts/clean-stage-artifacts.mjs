import fs from "node:fs";

for (const target of ["dist", "package"]) {
  fs.rmSync(target, { recursive: true, force: true });
}
