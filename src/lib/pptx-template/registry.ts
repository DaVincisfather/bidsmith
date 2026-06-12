// registry.ts — DEPRECATED: konfigurationen bor i templates-tabellen (migration 004).
// Kvar endast som läsare av det bundlade manifestet för tester och offline-skript.
import { readFileSync } from "fs";
import path from "path";
import { TemplateManifestSchema, type TemplateManifest } from "./manifest-types";

export function loadBundledManifest(name = "anbudsmall-v2"): TemplateManifest {
  const file = path.resolve("templates", `${name}.manifest.json`);
  return TemplateManifestSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export function bundledTemplate(name = "anbudsmall-v2") {
  return {
    manifest: loadBundledManifest(name),
    templateFile: path.resolve("templates", `${name}.pptx`),
  };
}
