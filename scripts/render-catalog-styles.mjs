#!/usr/bin/env node

import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    tokenValue,
    validateTokens,
} from '../extension/shared/token-geometry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokenPath = path.join(root, 'design/system/tokens.json');
const templatePath = path.join(root, 'extension/shared/stylesheet.template.css');
const outputPaths = [
    path.join(root, 'design/direction-lab/stylesheet.css'),
    path.join(root, 'extension/stylesheet.css'),
];

export function renderStyles(template, tokens) {
    validateTokens(tokens);
    const rendered = template.replace(/\{\{([a-zA-Z0-9.]+)\}\}/g,
        (_placeholder, tokenPath) => String(tokenValue(tokens, tokenPath)));
    const unresolved = rendered.match(/\{\{[^}]+\}\}/g);
    if (unresolved)
        throw new Error(`Unresolved design token placeholders: ${unresolved.join(', ')}`);
    return `/* Generated from stylesheet.template.css and design/system/tokens.json. */\n${rendered}`;
}

async function main() {
    const checkOnly = process.argv.includes('--check');
    const unknownArgs = process.argv.slice(2).filter(argument => argument !== '--check');
    if (unknownArgs.length > 0)
        throw new Error(`Unknown arguments: ${unknownArgs.join(' ')}`);

    const [tokenSource, template] = await Promise.all([
        readFile(tokenPath, 'utf8'),
        readFile(templatePath, 'utf8'),
    ]);
    const rendered = renderStyles(template, JSON.parse(tokenSource));

    if (checkOnly) {
        for (const outputPath of outputPaths) {
            const current = await readFile(outputPath, 'utf8').catch(() => null);
            if (current !== rendered)
                throw new Error('Generated stylesheet is stale; run node scripts/render-catalog-styles.mjs');
        }
        process.stdout.write('catalog and production stylesheets: current\n');
        return;
    }

    await Promise.all(outputPaths.map(outputPath => writeFile(outputPath, rendered)));
    process.stdout.write('stylesheets: wrote ' + outputPaths
        .map(outputPath => path.relative(root, outputPath)).join(', ') + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url))
    await main();
