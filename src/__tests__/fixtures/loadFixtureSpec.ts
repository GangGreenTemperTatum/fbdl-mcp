import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFbdlReference } from "../../specParser.js";
import { setSpec } from "../../spec.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "fbdl_reference.json");

export const FIXTURE_PATH = fixturePath;
export const FIXTURE_JSON: unknown = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;

export function installFixtureSpec(): void {
  const parsed = parseFbdlReference(FIXTURE_JSON);
  setSpec(parsed.entities, parsed.actions);
}
