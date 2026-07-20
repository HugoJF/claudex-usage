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
// Optional `--status` additionally prints the canonical pitch -> brief -> Spec ->
// slice tree derived from `parent_ids` and literal build-slice checkboxes.
// Exit 1 on any violation.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, isAbsolute } from "node:path";

const REQUIRED_KEYS = {
  pitch: ["id", "type", "status", "owner", "created", "updated"],
  spec: ["id", "type", "status", "owner", "created", "updated"],
  "product-brief": ["id", "type", "status", "owner", "created", "updated"],
  "decision-record": ["id", "type", "status", "created"],
  "engineering-decision": ["id", "type", "created", "spec_ids", "supersedes"],
};

const violations = [];
const warnings = [];
const legacyCheckoutMappings = [];
const documentRecords = [];
const derivedAuthorityRoots = new Set();

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

function levelTwoSectionBody(text, sectionName) {
  const heading = new RegExp(`^## ${sectionName}\\s*$`, "m").exec(text);
  if (!heading) {
    return "";
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
  if ("legacyCheckoutRoots" in config) {
    if (!Array.isArray(config.legacyCheckoutRoots)) {
      violations.push(`${configFile}: 'legacyCheckoutRoots' must be an array`);
    } else {
      for (const root of config.legacyCheckoutRoots) {
        if (typeof root !== "string" || root === "" || !isAbsolute(root)) {
          violations.push(
            `${configFile}: every legacy checkout root must be a non-empty absolute path`,
          );
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
  }
  if ("documentAuthority" in config) {
    if (config.documentAuthority !== "derived-v1") {
      violations.push(
        `${configFile}: unsupported 'documentAuthority' value '${config.documentAuthority}' (expected 'derived-v1')`,
      );
    } else {
      derivedAuthorityRoots.add(resolve(projectRoot));
    }
  }
}

function derivedProjectRoot(file) {
  const resolved = resolve(file);
  return [...derivedAuthorityRoots].find(
    (root) => resolved === root || resolved.startsWith(`${root}/`),
  );
}

function lintDerivedAuthority(file, text, data) {
  const projectRoot = derivedProjectRoot(file);
  if (!projectRoot) {
    return;
  }
  const relative = file.slice(projectRoot.length + 1).replaceAll("\\", "/");
  if (["pitch", "product-brief", "spec"].includes(data?.type) && "child_docs" in data) {
    violations.push(
      `${file}: 'child_docs' is forbidden by documentAuthority 'derived-v1'; parent_ids is canonical`,
    );
  }
  if (relative === "docs/product/README.md") {
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (/(^|\/)(briefs|specs)\/[^/]+\.md$/i.test(target)) {
        violations.push(
          `${file}: derived product navigation must not catalog individual briefs or specs -> ${match[1]}`,
        );
      }
    }
  }
  if (relative === "docs/product/feature-horizon.md") {
    if (/^- \[[ xX]\] /m.test(text)) {
      violations.push(`${file}: feature horizon must not carry delivery checkboxes`);
    }
    if (/\b[A-Z][A-Z0-9]{1,10}-\d{3}\b/.test(text)) {
      violations.push(`${file}: feature horizon must not duplicate Spec or slice IDs`);
    }
    if (/\|\s*status\s*\|/i.test(text)) {
      violations.push(
        `${file}: feature horizon tracks priority/release stage, not document or delivery status`,
      );
    }
  }
  if (
    relative === "docs/engineering/decision-log.md" &&
    !text.includes("<!-- aura:legacy-decision-log -->")
  ) {
    violations.push(
      `${file}: derived-v1 treats decision-log.md as a frozen legacy archive; add the legacy marker after migration or move new decisions into docs/engineering/decisions/`,
    );
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
    const title = /^# +(.+)$/m.exec(text)?.[1]?.trim() ?? data.id ?? file;
    const buildSlices = levelTwoSectionBody(text, "Build Slices");
    const slices = [...buildSlices.matchAll(/^- \[([ xX])\]\s+(.+)$/gm)].map((match) => ({
      done: match[1].toLowerCase() === "x",
      text: match[2].trim(),
    }));
    documentRecords.push({ file, data, title, slices });

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
          `${file}: spec body is ${bodyLines} lines, over the ${SPEC_BUDGET_FAIL}-line ceiling (budget ~${SPEC_BUDGET_WARN}); mechanism likely leaked in (→ engineering decision) or a contract got restated (→ link it)`,
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

  lintDerivedAuthority(file, text, fm?.data);

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
  // Immutable engineering decisions and a frozen legacy `decision-log.md` are history
  // (exempt); a single evergreen line can opt out with trailing `<!-- retired-ok -->`
  // for a legitimate "X replaces Y" mention.
  if (
    retiredTerms.length > 0 &&
    file.endsWith(".md") &&
    !file.endsWith("decision-log.md") &&
    fm?.data?.type !== "engineering-decision"
  ) {
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

function listValue(data, key, file) {
  const value = data[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    violations.push(`${file}: '${key}' must be a frontmatter list`);
    return [];
  }
  return value;
}

function renderStatusTree({ print = true } = {}) {
  const records = documentRecords.filter((record) =>
    ["pitch", "product-brief", "spec"].includes(record.data.type),
  );
  const byId = new Map();
  for (const record of records) {
    const id = record.data.id;
    if (typeof id !== "string" || id === "") {
      violations.push(`${record.file}: status graph document requires a non-empty 'id'`);
      continue;
    }
    if (byId.has(id)) {
      violations.push(`${record.file}: duplicate document id '${id}' (also ${byId.get(id).file})`);
      continue;
    }
    byId.set(id, record);
    if ("child_docs" in record.data && !derivedProjectRoot(record.file)) {
      warnings.push(
        `${record.file}: legacy 'child_docs' is deprecated and ignored; parent_ids is canonical`,
      );
    }
  }

  const pitches = records.filter((record) => record.data.type === "pitch");
  if (pitches.length !== 1) {
    violations.push(`status graph requires exactly one pitch, found ${pitches.length}`);
  }

  const parentById = new Map();
  const childrenById = new Map();
  const unlinked = new Set();
  for (const record of records) {
    const id = record.data.id;
    if (typeof id !== "string" || !byId.has(id)) {
      continue;
    }
    const parents = listValue(record.data, "parent_ids", record.file);
    if (derivedProjectRoot(record.file) && !("parent_ids" in record.data)) {
      violations.push(
        `${record.file}: documentAuthority 'derived-v1' requires a 'parent_ids' list`,
      );
    }
    if (record.data.type === "pitch") {
      if (parents.length > 0) {
        violations.push(`${record.file}: pitch must not declare parent_ids`);
        unlinked.add(id);
      }
      continue;
    }
    const expectedParentType = record.data.type === "product-brief" ? "pitch" : "product-brief";
    if (parents.length !== 1) {
      violations.push(
        `${record.file}: ${record.data.type} requires exactly one ${expectedParentType} parent_id`,
      );
      unlinked.add(id);
      continue;
    }
    const parentId = parents[0];
    const parent = byId.get(parentId);
    if (!parent) {
      violations.push(`${record.file}: parent_id '${parentId}' does not resolve`);
      unlinked.add(id);
      continue;
    }
    if (parent.data.type !== expectedParentType) {
      violations.push(
        `${record.file}: parent_id '${parentId}' has type '${parent.data.type}', expected '${expectedParentType}'`,
      );
      unlinked.add(id);
      continue;
    }
    parentById.set(id, parentId);
    childrenById.set(parentId, [...(childrenById.get(parentId) ?? []), id]);
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id, path = []) {
    if (visiting.has(id)) {
      violations.push(`status graph contains a cycle: ${[...path, id].join(" -> ")}`);
      unlinked.add(id);
      return;
    }
    if (visited.has(id)) {
      return;
    }
    visiting.add(id);
    const parentId = parentById.get(id);
    if (parentId) {
      visit(parentId, [...path, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) {
    visit(id);
  }

  const lines = ["Document Status"];
  const sortIds = (ids) => [...ids].sort((a, b) => a.localeCompare(b));
  const rendered = new Set();
  function render(id, depth) {
    if (rendered.has(id)) {
      return;
    }
    const record = byId.get(id);
    if (!record) {
      return;
    }
    rendered.add(id);
    const indent = "  ".repeat(depth);
    const status = typeof record.data.status === "string" ? record.data.status : "unknown";
    const progress =
      record.data.type === "spec" && record.slices.length > 0
        ? ` (${record.slices.filter((slice) => slice.done).length}/${record.slices.length})`
        : "";
    lines.push(`${indent}${id} [${status}]${progress} — ${record.title}`);
    if (record.data.type === "spec") {
      for (const slice of record.slices) {
        lines.push(`${indent}  [${slice.done ? "x" : " "}] ${slice.text}`);
      }
    }
    for (const childId of sortIds(childrenById.get(id) ?? [])) {
      render(childId, depth + 1);
    }
  }

  for (const pitch of sortIds(pitches.map((record) => record.data.id))) {
    render(pitch, 0);
  }
  for (const id of byId.keys()) {
    if (!rendered.has(id)) {
      unlinked.add(id);
    }
  }
  if (unlinked.size > 0) {
    lines.push("Unlinked");
    for (const id of sortIds(unlinked)) {
      render(id, 1);
    }
  }
  if (print) {
    console.log(lines.join("\n"));
  }
}

function validateDecisionRecords() {
  const records = documentRecords.filter(
    (record) => record.data.type === "engineering-decision",
  );
  const byId = new Map();
  for (const record of records) {
    const id = record.data.id;
    if (typeof id !== "string" || id === "") {
      violations.push(`${record.file}: engineering decision requires a non-empty 'id'`);
      continue;
    }
    if (byId.has(id)) {
      violations.push(
        `${record.file}: duplicate engineering decision id '${id}' (also ${byId.get(id).file})`,
      );
      continue;
    }
    byId.set(id, record);
  }

  const supersedesById = new Map();
  const superseded = new Set();
  for (const [id, record] of byId) {
    const targets = listValue(record.data, "supersedes", record.file);
    supersedesById.set(id, targets);
    for (const targetId of targets) {
      if (targetId === id) {
        violations.push(`${record.file}: engineering decision cannot supersede itself`);
        continue;
      }
      if (!byId.has(targetId)) {
        violations.push(`${record.file}: supersedes id '${targetId}' does not resolve`);
        continue;
      }
      superseded.add(targetId);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id, path = []) {
    if (visiting.has(id)) {
      violations.push(`engineering decision supersedes graph contains a cycle: ${[...path, id].join(" -> ")}`);
      return;
    }
    if (visited.has(id)) {
      return;
    }
    visiting.add(id);
    for (const targetId of supersedesById.get(id) ?? []) {
      if (byId.has(targetId)) {
        visit(targetId, [...path, id]);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) {
    visit(id);
  }

  const activeTitles = new Map();
  for (const [id, record] of byId) {
    if (superseded.has(id)) {
      continue;
    }
    const normalized = record.title
      .replace(/^Decision:\s*/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (normalized === "") {
      continue;
    }
    if (activeTitles.has(normalized)) {
      violations.push(
        `${record.file}: duplicate active engineering decision title '${record.title}' (also ${activeTitles.get(normalized).file}); supersede the earlier record explicitly`,
      );
    } else {
      activeTitles.set(normalized, record);
    }
  }
}

const args = process.argv.slice(2);
const statusMode = args.includes("--status");
const dirs = args.filter((arg) => arg !== "--status");
if (dirs.length === 0) {
  console.error("usage: doc-lint.mjs [--status] <docs-dir> [<docs-dir>...]");
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

if (statusMode || derivedAuthorityRoots.size > 0) {
  renderStatusTree({ print: statusMode });
}
validateDecisionRecords();

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
