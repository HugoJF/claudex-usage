#!/usr/bin/env node
// Structural validator for docs/product/** markdown (aura workflow, WORKFLOW.md §7).
// Usage: node doc-lint.mjs <docs-dir> [<docs-dir>...]
// Checks per file with YAML frontmatter:
//   - frontmatter parses (flat keys + simple lists only)
//   - required keys present for known types (spec, product-brief, decision-record)
//   - status: done  => no unchecked "- [ ]" build-slice boxes
//   - done automation specs contain non-placeholder Operational Evidence
//   - updated >= created (ISO dates)
//   - relative markdown links resolve on disk (anchors ignored)
//   - configured legacy checkout links remap to this checkout; other absolute links fail
//   - retired vocabulary (docs/.retired-terms) does not reappear in evergreen docs
// Exit 1 on any violation.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, isAbsolute } from "node:path";

const REQUIRED_KEYS = {
  spec: ["id", "type", "status", "owner", "created", "updated"],
  "product-brief": ["id", "type", "status", "owner", "created", "updated"],
  "decision-record": ["id", "type", "status", "created"],
};

const violations = [];
const warnings = [];
const legacyCheckoutMappings = [];

// Retired vocabulary: phrases a concept migration retired, listed by a project in
// `<docs>/.retired-terms` (one `pattern :: reason` per line, `#` comments). Once a term
// is retired, doc-lint flags any reappearance in an evergreen doc — so a superseded
// model's prose (the calorie-tracker copy-snapshot→version-pinning drift) can't quietly
// survive a reconcile sweep. Populated in main from the scanned roots' parent dirs.
const retiredTerms = [];

// Spec line budget (WORKFLOW §5): ~150 body lines. Warn over the target, fail well
// over it — a blunt guard against bloat; it will not catch dense-under-budget prose,
// which the tight-doc template shape addresses instead. Specs authored before the
// rule landed are grandfathered: they warn but never fail (backfill on next touch).
const SPEC_BUDGET_WARN = 150;
const SPEC_BUDGET_FAIL = 200;
const SPEC_BUDGET_ENFORCED_FROM = "2026-07-07"; // created >= this date can fail the ceiling

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) {
    return null;
  }
  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    return { error: "unterminated frontmatter" };
  }
  const body = text.slice(4, end);
  const data = {};
  let currentListKey = null;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (line === "") {
      continue;
    }
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && currentListKey) {
      data[currentListKey].push(listItem[1].trim());
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) {
      if (/^\s/.test(line)) {
        continue; // nested mapping (e.g. metadata) — out of scope
      }
      return { error: `unparseable frontmatter line: ${JSON.stringify(line)}` };
    }
    const [, key, value] = kv;
    if (value === "[]") {
      data[key] = [];
      currentListKey = null;
    } else if (/^\[.*\]$/.test(value)) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
      currentListKey = null;
    } else if (value === "") {
      data[key] = [];
      currentListKey = key;
    } else {
      data[key] = value.replace(/\s+#.*$/, "").trim();
      currentListKey = null;
    }
  }
  return { data, contentStart: end + 4 };
}

function hasFrontmatterTag(data, tag) {
  return Array.isArray(data.tags) && data.tags.includes(tag);
}

function operationalEvidenceBody(text) {
  const heading = /^## Operational Evidence\s*$/m.exec(text);
  if (!heading) {
    return null;
  }
  const start = heading.index + heading[0].length;
  const rest = text.slice(start);
  const nextHeading = /^#{1,2} +/m.exec(rest);
  return nextHeading ? rest.slice(0, nextHeading.index) : rest;
}

function isMeaningfulOperationalEvidence(body) {
  if (body === null) {
    return false;
  }
  const lines = body
    .split("\n")
    .map((line) => line.replace(/<!--.*?-->/g, "").replace(/^\s*[-*>#]+\s*/, "").trim())
    .filter(Boolean);
  const placeholder = /^(pending|todo|tbd|none|not yet|not available)\b/i;
  return lines.length > 0 && !lines.some((line) => placeholder.test(line));
}

function loadDocLintConfig(configFile, projectRoot) {
  if (!existsSync(configFile)) {
    return;
  }
  let config;
  try {
    config = JSON.parse(readFileSync(configFile, "utf8"));
  } catch (error) {
    violations.push(`${configFile}: invalid JSON (${error.message})`);
    return;
  }
  if (config === null || Array.isArray(config) || typeof config !== "object") {
    violations.push(`${configFile}: config must be a JSON object`);
    return;
  }
  if (!("legacyCheckoutRoots" in config)) {
    return;
  }
  if (!Array.isArray(config.legacyCheckoutRoots)) {
    violations.push(`${configFile}: 'legacyCheckoutRoots' must be an array`);
    return;
  }
  for (const root of config.legacyCheckoutRoots) {
    if (typeof root !== "string" || root === "" || !isAbsolute(root)) {
      violations.push(`${configFile}: every legacy checkout root must be a non-empty absolute path`);
      continue;
    }
    const withSlash = root.endsWith("/") ? root : `${root}/`;
    legacyCheckoutMappings.push({
      legacyRoot: withSlash,
      projectRoot,
      configFile,
      remapCount: 0,
      sampleFile: null,
      sampleTarget: null,
    });
  }
}

function resolveLinkPath(decoded, file, target) {
  if (!isAbsolute(decoded)) {
    return resolve(dirname(file), decoded);
  }
  for (const mapping of legacyCheckoutMappings) {
    const rootWithoutSlash = mapping.legacyRoot.slice(0, -1);
    if (decoded === rootWithoutSlash || decoded.startsWith(mapping.legacyRoot)) {
      const suffix = decoded === rootWithoutSlash ? "" : decoded.slice(mapping.legacyRoot.length);
      const remapped = resolve(mapping.projectRoot, suffix);
      mapping.remapCount += 1;
      mapping.sampleFile ??= file;
      mapping.sampleTarget ??= target;
      return remapped;
    }
  }
  violations.push(`${file}: nonportable absolute link -> ${target}`);
  return null;
}

function lintFile(file, mdByBasename) {
  const text = readFileSync(file, "utf8");
  const fm = parseFrontmatter(text);
  if (fm && fm.error) {
    violations.push(`${file}: ${fm.error}`);
    return;
  }
  if (fm) {
    const { data } = fm;
    const type = typeof data.type === "string" ? data.type : undefined;

    if (type && REQUIRED_KEYS[type]) {
      for (const key of REQUIRED_KEYS[type]) {
        if (!(key in data)) {
          violations.push(`${file}: missing required frontmatter key '${key}' for type '${type}'`);
        }
      }
    }

    if (typeof data.created === "string" && typeof data.updated === "string") {
      const created = Date.parse(data.created);
      const updated = Date.parse(data.updated);
      if (!Number.isNaN(created) && !Number.isNaN(updated) && updated < created) {
        violations.push(`${file}: updated (${data.updated}) is before created (${data.created})`);
      }
    }

    if (data.status === "done" && /^- \[ \] /m.test(text)) {
      violations.push(`${file}: status is 'done' but unchecked '- [ ]' boxes remain`);
    }

    if (
      type === "spec" &&
      data.status === "done" &&
      hasFrontmatterTag(data, "automation") &&
      !isMeaningfulOperationalEvidence(operationalEvidenceBody(text))
    ) {
      violations.push(
        `${file}: done automation spec requires non-placeholder '## Operational Evidence' from a real trigger`,
      );
    }

    if (type === "spec") {
      const body = text.slice(fm.contentStart ?? 0);
      const bodyLines = body.replace(/\s+$/, "").split("\n").length;
      const enforced =
        typeof data.created === "string" && data.created >= SPEC_BUDGET_ENFORCED_FROM;
      if (bodyLines > SPEC_BUDGET_FAIL && enforced) {
        violations.push(
          `${file}: spec body is ${bodyLines} lines, over the ${SPEC_BUDGET_FAIL}-line ceiling (budget ~${SPEC_BUDGET_WARN}); mechanism likely leaked in (→ decision log) or a contract got restated (→ link it)`,
        );
      } else if (bodyLines > SPEC_BUDGET_WARN) {
        const tail = enforced
          ? "tighten toward tables/lists before it grows"
          : `grandfathered (created before ${SPEC_BUDGET_ENFORCED_FROM}) — tighten on next touch`;
        warnings.push(
          `${file}: spec body is ${bodyLines} lines, over the ~${SPEC_BUDGET_WARN}-line budget (WORKFLOW §5) — ${tail}`,
        );
      }
    }
  }

  // §"Section" references: `some-doc.md` §"Heading Name" must name a real heading in
  // that doc — this is how a section rename in a shared doc breaks its inbound
  // pointers silently (the calorie-tracker data-model rewrite lesson, 2026-07-07).
  for (const match of text.matchAll(/§"([^"]+)"/gs)) {
    const before = text.slice(Math.max(0, match.index - 100), match.index);
    const fileMention = [...before.matchAll(/([A-Za-z0-9._/-]+\.md)/g)].pop();
    if (!fileMention) {
      continue;
    }
    const basename = fileMention[1].split("/").pop();
    const targets = mdByBasename.get(basename) ?? [];
    if (targets.length !== 1) {
      continue; // ambiguous or outside the scanned roots — not checkable
    }
    const targetText = readFileSync(targets[0], "utf8");
    const section = match[1].replace(/\s+/g, " ").trim();
    const found = [...targetText.matchAll(/^#{1,6} +(.+)$/gm)].some((h) =>
      h[1].replace(/\s+/g, " ").includes(section),
    );
    if (!found) {
      violations.push(
        `${file}: section reference ${basename} §"${section}" matches no heading in ${basename}`,
      );
    }
  }

  // Retired vocabulary: a listed phrase must not reappear in an evergreen doc.
  // `decision-log.md` is append-only history (exempt); a single line opts out with a
  // trailing `<!-- retired-ok -->` (for a legitimate "X replaces Y" mention).
  if (retiredTerms.length > 0 && file.endsWith(".md") && !file.endsWith("decision-log.md")) {
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.includes("retired-ok")) {
        continue;
      }
      for (const term of retiredTerms) {
        if (term.re.test(line)) {
          violations.push(
            `${file}:${i + 1}: retired term "${term.raw}"${term.reason ? ` — ${term.reason}` : ""}`,
          );
        }
      }
    }
  }

  const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
  for (const match of text.matchAll(linkRe)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) {
      continue;
    }
    const path = target.split("#")[0];
    if (path === "") {
      continue;
    }
    const decoded = decodeURI(path);
    const full = resolveLinkPath(decoded, file, target);
    if (full && !existsSync(full)) {
      violations.push(`${file}: broken relative link -> ${target}`);
    }
  }
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("usage: doc-lint.mjs <docs-dir> [<docs-dir>...]");
  process.exit(2);
}

const allFiles = [];
const docsRoots = new Set(dirs.map((dir) => dirname(resolve(dir))));
for (const docsRoot of docsRoots) {
  loadDocLintConfig(join(docsRoot, ".doc-lint.json"), dirname(docsRoot));
}
for (const dir of dirs) {
  if (!existsSync(dir)) {
    console.error(`doc-lint: no such directory: ${dir}`);
    process.exit(2);
  }
  allFiles.push(...walk(resolve(dir)));
}
const mdByBasename = new Map();
for (const file of allFiles) {
  const base = file.split("/").pop();
  mdByBasename.set(base, [...(mdByBasename.get(base) ?? []), file]);
}

// Load retired vocabulary from `.retired-terms` beside each scanned root (e.g. docs/ when
// linting docs/product + docs/engineering). Union across roots, deduped by file.
const retiredFiles = new Set(dirs.map((dir) => join(dirname(resolve(dir)), ".retired-terms")));
for (const rf of retiredFiles) {
  if (!existsSync(rf)) {
    continue;
  }
  for (const [idx, rawLine] of readFileSync(rf, "utf8").split("\n").entries()) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const [pattern, ...reasonParts] = line.split("::");
    const src = pattern.trim();
    try {
      retiredTerms.push({ re: new RegExp(src, "i"), reason: reasonParts.join("::").trim(), raw: src });
    } catch {
      violations.push(`${rf}:${idx + 1}: invalid retired-term regex: ${src}`);
    }
  }
}

let fileCount = 0;
for (const file of allFiles) {
  fileCount += 1;
  lintFile(file, mdByBasename);
}

for (const mapping of legacyCheckoutMappings) {
  if (mapping.remapCount > 0) {
    warnings.push(
      `${mapping.configFile}: remapped ${mapping.remapCount} legacy checkout link(s) from '${mapping.legacyRoot}' to this checkout; use relative links when those docs are next edited (example: ${mapping.sampleFile} -> ${mapping.sampleTarget})`,
    );
  }
}

for (const w of warnings) {
  console.warn(`warning: ${w}`);
}

if (violations.length > 0) {
  for (const v of violations) {
    console.error(v);
  }
  console.error(`\ndoc-lint: ${violations.length} violation(s) across ${fileCount} file(s)`);
  process.exit(1);
}
const warnNote = warnings.length > 0 ? `, ${warnings.length} warning(s)` : "";
console.log(`doc-lint: OK (${fileCount} file(s)${warnNote})`);
