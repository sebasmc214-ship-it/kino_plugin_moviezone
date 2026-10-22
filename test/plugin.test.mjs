// Prueba sin conexión: las respuestas provienen de test/fixtures.json
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../sdk/validate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "test", "fixtures.json");

test("Kino acepta el manifiesto y los exports", async () => {
  const r = await validate(root);
  assert.deepEqual(r.problems, []);
});

test("search responde sin conexión y Kino no descarta nada", { skip: !existsSync(fixtures) && "graba test/fixtures.json primero" }, async () => {
  const r = await validate(root, { run: "search", args: ["batman"], replay: fixtures });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.drops, []);
  assert.ok(r.output.items.length > 0);
});
