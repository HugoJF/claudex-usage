#!/usr/bin/env node

import {
    copyFileSync,
    cpSync,
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const updateCaptures = process.argv.includes('--update-captures');
const unknownArgs = process.argv.slice(2)
    .filter(argument => argument !== '--update-captures');
if (unknownArgs.length > 0)
    throw new Error(`Unknown arguments: ${unknownArgs.join(' ')}`);

const catalogCaptures = [
    'panel-dark-100.png',
    'usage-dark-100.png',
    'usage-range-7d-focus-hover.png',
    'settings-dark-100.png',
    'settings-toggle-off-focus-hover.png',
    'panel-visibility-off.png',
    'panel-light-100.png',
    'panel-dark-200.png',
];
const surfaceCaptures = [
    'surface-panel-dark-100.png',
    'surface-popup-dark-100.png',
    'surface-refresh-focus-hover.png',
    'surface-unavailable-popup.png',
    'surface-panel-light-100.png',
    'surface-panel-dark-200.png',
];

function run(command, args, options = {}) {
    process.stdout.write(`\n> ${command} ${args.join(' ')}\n`);
    const result = spawnSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        stdio: 'inherit',
        ...options,
    });
    if (result.error)
        throw result.error;
    if (result.status !== 0)
        throw new Error(`${command} exited with status ${result.status}`);
}

function packageEntries(zipPath) {
    const zip = readFileSync(zipPath);
    const entries = new Set();
    let offset = 0;
    while (offset <= zip.length - 46) {
        const header = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset);
        if (header < 0)
            break;
        const filenameLength = zip.readUInt16LE(header + 28);
        const extraLength = zip.readUInt16LE(header + 30);
        const commentLength = zip.readUInt16LE(header + 32);
        const filenameStart = header + 46;
        entries.add(zip.subarray(filenameStart,
            filenameStart + filenameLength).toString('utf8'));
        offset = filenameStart + filenameLength + extraLength + commentLength;
    }
    if (entries.size === 0)
        throw new Error(`Unable to inspect ${zipPath}`);
    return entries;
}

function assertPackageEntries(entries, label, extraRequired = []) {
    for (const required of [
        'metadata.json',
        'extension.js',
        'stylesheet.css',
        'tokens.json',
        'shared/primitives.js',
        'shared/token-geometry.js',
        'shared/stylesheet.template.css',
        ...extraRequired,
    ]) {
        if (!entries.has(required))
            throw new Error(`${label} package is missing ${required}`);
    }
    for (const stale of ['primitives.js', 'token-geometry.js',
        'stylesheet.template.css']) {
        if (entries.has(stale))
            throw new Error(`${label} package contains stale root ${stale}`);
    }
}

function assertPackage(zipPath, label, extraRequired = []) {
    const entries = packageEntries(zipPath);
    assertPackageEntries(entries, label, extraRequired);
    process.stdout.write(`${label} package: complete\n`);
    return entries;
}

function assertVerifierRejects(entries) {
    const expectFailure = (fixture, message) => {
        try {
            assertPackageEntries(fixture, 'invalid');
        } catch {
            return;
        }
        throw new Error(`Package verifier accepted ${message}`);
    };
    const absent = new Set(entries);
    absent.delete('shared/token-geometry.js');
    expectFailure(absent, 'an absent shared dependency');

    const misplaced = new Set(entries);
    misplaced.delete('shared/token-geometry.js');
    misplaced.add('token-geometry.js');
    expectFailure(misplaced, 'a misplaced shared dependency');

    const stale = new Set(entries);
    stale.add('primitives.js');
    expectFailure(stale, 'a stale root primitive module');
    process.stdout.write('package verifier: rejection fixtures passed\n');
}

function assertProductionVerifierRejects(entries) {
    const expectFailure = (fixture, message) => {
        try {
            assertPackageEntries(fixture, 'invalid', ['surface-controller.js',
                'icons/claude.svg', 'icons/codex.svg']);
            for (const forbidden of ['catalog-state.js', 'stub-provider.js']) {
                if (fixture.has(forbidden))
                    throw new Error(`invalid package contains ${forbidden}`);
            }
        } catch {
            return;
        }
        throw new Error(`Production package verifier accepted ${message}`);
    };
    for (const required of ['surface-controller.js', 'shared/primitives.js',
        'tokens.json', 'icons/claude.svg']) {
        const absent = new Set(entries);
        absent.delete(required);
        expectFailure(absent, `an absent ${required}`);
    }
    const catalogFixture = new Set(entries);
    catalogFixture.add('catalog-state.js');
    expectFailure(catalogFixture, 'a catalog fixture');
    const stubFixture = new Set(entries);
    stubFixture.add('stub-provider.js');
    expectFailure(stubFixture, 'a packaged stub');
    process.stdout.write('production package verifier: rejection fixtures passed\n');
}

function assertCaptures(captureDir, captures, label, compareCanonical) {
    for (const filename of captures) {
        const bytes = readFileSync(path.join(captureDir, filename));
        const pngSignature = bytes.subarray(0, 8).toString('hex');
        if (pngSignature !== '89504e470d0a1a0a' || bytes.length < 256)
            throw new Error(`${filename} is not a non-empty PNG capture`);
        if (compareCanonical) {
            const result = spawnSync('compare', [
                '-metric', 'AE',
                path.join(root, 'design/captures', filename),
                path.join(captureDir, filename),
                'null:',
            ], {cwd: root, encoding: 'utf8'});
            if (result.error)
                throw result.error;
            const absoluteError = Number.parseFloat(result.stderr);
            if (result.status !== 0 || absoluteError !== 0)
                throw new Error(`${filename} differs by ${absoluteError} pixels`);
        }
    }
    const comparison = compareCanonical ? ' and pixel-identical' : '';
    process.stdout.write(`${label} captures: ${captures.length} verified` +
        `${comparison}\n`);
}

function writeSharedConsumer(sourceDir, journeyPath) {
    mkdirSync(path.join(sourceDir, 'shared'), {recursive: true});
    cpSync(path.join(root, 'extension/shared'), path.join(sourceDir, 'shared'), {
        recursive: true,
    });
    copyFileSync(path.join(root, 'design/system/tokens.json'),
        path.join(sourceDir, 'tokens.json'));
    copyFileSync(path.join(root, 'design/direction-lab/stylesheet.css'),
        path.join(sourceDir, 'stylesheet.css'));
    writeFileSync(path.join(sourceDir, 'metadata.json'), JSON.stringify({
        uuid: 'claudex-shared-proof@hugo.local',
        name: 'Claudex Shared Presentation Proof',
        description: 'Temporary second consumer for SURF-001 validation',
        version: 1,
        'shell-version': ['50'],
    }, null, 2));
    writeFileSync(path.join(sourceDir, 'extension.js'), `
import Atk from 'gi://Atk';
import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {
    HistoryChart,
    PanelIndicator,
    PopoverScaffold,
    ProgressBar,
    RangeSelector,
    SettingsRow,
    Switch,
    validatePresentationModels,
} from './shared/primitives.js';
import {validateTokens} from './shared/token-geometry.js';

function loadTokens(extensionPath) {
    const file = Gio.File.new_for_path(\`\${extensionPath}/tokens.json\`);
    const [loaded, contents] = file.load_contents(null);
    if (!loaded)
        throw new Error('proof tokens did not load');
    return validateTokens(JSON.parse(new TextDecoder().decode(contents)));
}

export default class SharedProofExtension extends Extension {
    enable() {
        console.log('SURF-001 proof extension enabled');
        const tokens = loadTokens(this.path);
        this.tokens = tokens;
        this.events = [];
        this.panel = PanelIndicator({
            id: 'proof-panel',
            groups: [{
                id: 'aurora',
                iconPath: '/tmp/noncanonical-aurora.svg',
                accessibleName: 'Aurora',
                values: [{id: 'burst', percent: 37.5}],
            }],
            tokens,
        });
        this.range = RangeSelector({
            choices: [
                {id: 'burst', label: 'Burst', accessibleName: 'Burst range'},
                {id: 'season', label: 'Season', accessibleName: 'Season range'},
            ],
            selected: 'season',
            onSelect: id => this.events.push(['range', id]),
        });
        this.setting = SettingsRow({
            id: 'ambientMode',
            title: 'Ambient mode',
            description: 'A noncatalog setting',
            accessibleName: 'Toggle ambient mode',
            active: false,
            onToggle: id => this.events.push(['toggle', id]),
            tokens,
        });
        this.progress = ProgressBar({
            metric: {
                id: 'burstLoad',
                percent: 37.5,
                accessibleName: 'Burst load at 37.5 percent',
                dataRole: 'dataCodexWeekly',
            },
            tokens,
        });
        this.chart = HistoryChart({
            id: 'proof-chart',
            accessibleName: 'Synthetic proof history',
            axisLabels: ['Peak', 'High', 'Middle', 'Low', 'Floor'],
            series: [
                {id: 'north', values: [0, 12.5, 100],
                    dataRole: 'dataClaudeShort', strokeWidth: 1.5},
                {id: 'south', values: [100, 40, 0],
                    dataRole: 'dataCodexWeekly', strokeWidth: 3},
            ],
            tokens,
        });
        this.root = PopoverScaffold({
            id: 'proof-popover',
            view: 'proof',
            children: [this.panel, this.progress, this.range, this.setting, this.chart],
        });
        this.destroyed = false;
        this.root.connect('destroy', () => {
            this.destroyed = true;
        });
    }

    getProof() {
        return {
            root: this.root,
            panel: this.panel,
            range: this.range,
            setting: this.setting,
            progress: this.progress,
            events: this.events,
            destroyed: this.destroyed,
        };
    }

    validationFailures() {
        const baseSeries = {id: 'line', values: [0, 100],
            dataRole: 'dataClaudeShort', strokeWidth: 1};
        const probes = [
            () => validatePresentationModels({ids: ['unsafe id']}),
            () => validatePresentationModels({ids: ['same', 'same']}),
            () => validatePresentationModels({percentages: [NaN]}),
            () => validatePresentationModels({percentages: [-1]}),
            () => validatePresentationModels({percentages: [101]}),
            () => validatePresentationModels({historySeries: []}),
            () => validatePresentationModels({historySeries: [
                {...baseSeries, values: [1]},
            ]}),
            () => validatePresentationModels({historySeries: [
                baseSeries,
                {...baseSeries, id: 'other', values: [0, 1, 2]},
            ]}),
            () => validatePresentationModels({historySeries: [
                {...baseSeries, values: [0, Infinity]},
            ]}),
            () => validatePresentationModels({rangeChoices: [], selectedRange: 'x'}),
            () => validatePresentationModels({rangeChoices: [
                {id: 'x'}, {id: 'x'},
            ], selectedRange: 'x'}),
            () => validatePresentationModels({rangeChoices: [{id: 'x'}],
                selectedRange: 'y'}),
            () => validatePresentationModels({callbacks: [null]}),
            () => validatePresentationModels({accessibleNames: ['']}),
            () => validatePresentationModels({dataRoles: ['unsafe role']}),
            () => validatePresentationModels({
                dataRoles: ['dataMissing'],
                tokens: this.tokens,
            }),
            () => Switch({active: 'false', tokens: this.tokens}),
        ];
        return probes.map(probe => {
            try {
                probe();
                return false;
            } catch {
                return true;
            }
        });
    }

    destroyProof() {
        this.root?.destroy();
        this.root = null;
    }

    disable() {
        this.destroyProof();
        this.range = null;
        this.panel = null;
        this.setting = null;
        this.progress = null;
        this.chart = null;
        this.tokens = null;
        this.events = null;
    }
}
`);
    writeFileSync(journeyPath, `
import Atk from 'gi://Atk';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

const UUID = 'claudex-shared-proof@hugo.local';
export const METRICS = {};
export function init() {}
function assert(condition, message) {
    if (!condition)
        throw new Error(\`SURF-001 proof failed: \${message}\`);
}
export async function run() {
    await Scripting.sleep(180);
    const record = Main.extensionManager.lookup(UUID);
    console.log('SURF-001 proof lookup: state=' + record?.state +
        ', error=' + record?.error + ', stateObj=' + Boolean(record?.stateObj));
    const extension = record?.stateObj;
    assert(extension, 'temporary second consumer loaded');
    const proof = extension.getProof();
    assert(proof.panel.get_name() === 'proof-panel',
        'documented panel model works without catalog empty groups');
    assert(proof.progress.accessible_role === Atk.Role.PROGRESS_BAR,
        'progress role is preserved');
    assert(proof.progress.get_accessible_name() ===
        'Burst load at 37.5 percent', 'progress accessible name is model-driven');
    const choices = proof.range.get_children();
    assert(choices[0].accessible_role === Atk.Role.RADIO_BUTTON,
        'range role is preserved');
    assert(proof.setting.accessible_role === Atk.Role.SWITCH,
        'settings role is preserved');
    choices[0].emit('clicked', 1);
    proof.setting.emit('clicked', 1);
    assert(JSON.stringify(proof.events) ===
        JSON.stringify([['range', 'burst'], ['toggle', 'ambientMode']]),
        'callbacks receive stable model ids');
    assert(extension.validationFailures().every(Boolean),
        'all invalid presentation models fail closed');
    extension.destroyProof();
    assert(extension.getProof().root === null && extension.getProof().destroyed,
        'second consumer destroys its actor tree');
}
`);
}

const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'claudex-usage-check-'));
const packageDir = path.join(temporaryRoot, 'package');
const productionPackageDir = path.join(temporaryRoot, 'production-package');
const proofSourceDir = path.join(temporaryRoot, 'shared-proof');
const proofPackageDir = path.join(temporaryRoot, 'shared-proof-package');
const proofJourneyPath = path.join(temporaryRoot, 'shared-proof.journey.js');
const captureDir = updateCaptures
    ? path.join(root, 'design/captures')
    : path.join(temporaryRoot, 'captures');
mkdirSync(packageDir, {recursive: true});
mkdirSync(productionPackageDir, {recursive: true});
mkdirSync(proofPackageDir, {recursive: true});
mkdirSync(captureDir, {recursive: true});

try {
    run('node', ['scripts/doc-lint.mjs', 'docs/product', 'docs/engineering']);
    run('node', ['scripts/render-catalog-styles.mjs', '--check']);
    run('node', ['--test', 'tests/unit/catalog-state.test.js',
        'tests/unit/design-tokens.test.js', 'tests/unit/surface-controller.test.js']);
    run('gnome-extensions', [
        'pack',
        '--force',
        '--extra-source=icons',
        '--extra-source=catalog-state.js',
        '--extra-source=../../extension/shared',
        '--extra-source=../system/tokens.json',
        '--out-dir', packageDir,
        'design/direction-lab',
    ]);

    const zipPath = path.join(packageDir,
        'claudex-usage-design@hugo.local.shell-extension.zip');
    const catalogEntries = assertPackage(zipPath, 'catalog', [
        'catalog-state.js',
        'icons/claude.svg',
        'icons/claude-light.svg',
        'icons/codex.svg',
        'icons/codex-light.svg',
    ]);
    assertVerifierRejects(catalogEntries);
    run('gnome-extensions', [
        'pack',
        '--force',
        '--extra-source=surface-controller.js',
        '--extra-source=shared',
        '--extra-source=../design/system/tokens.json',
        '--extra-source=../design/direction-lab/icons',
        '--out-dir', productionPackageDir,
        'extension',
    ]);
    const productionZipPath = path.join(productionPackageDir,
        'claudex-usage@hugo.local.shell-extension.zip');
    const productionEntries = assertPackage(productionZipPath, 'production', [
        'surface-controller.js',
        'icons/claude.svg',
        'icons/claude-light.svg',
        'icons/codex.svg',
        'icons/codex-light.svg',
    ]);
    for (const forbidden of ['catalog-state.js', 'stub-provider.js']) {
        if (productionEntries.has(forbidden))
            throw new Error(`production package contains forbidden ${forbidden}`);
    }
    assertProductionVerifierRejects(productionEntries);
    writeSharedConsumer(proofSourceDir, proofJourneyPath);
    run('gnome-extensions', [
        'pack',
        '--force',
        '--extra-source=shared',
        '--extra-source=tokens.json',
        '--out-dir', proofPackageDir,
        proofSourceDir,
    ]);
    const proofZipPath = path.join(proofPackageDir,
        'claudex-shared-proof@hugo.local.shell-extension.zip');
    assertPackage(proofZipPath, 'shared consumer');
    run('dbus-run-session', [
        '--',
        'gnome-shell-test-tool',
        '--devkit',
        '--disable-animations',
        '--extension', proofZipPath,
        proofJourneyPath,
    ]);
    run('dbus-run-session', [
        '--',
        'gnome-shell-test-tool',
        '--devkit',
        '--disable-animations',
        '--extension', zipPath,
        'tests/journeys/J-001-primitive-catalog.journey.test.js',
    ], {
        env: {...process.env, CLAUDEX_CAPTURE_DIR: captureDir},
    });
    run('dbus-run-session', [
        '--',
        'gnome-shell-test-tool',
        '--devkit',
        '--disable-animations',
        '--extension', productionZipPath,
        'tests/journeys/J-002-usage-surface.journey.test.js',
    ], {
        env: {...process.env, CLAUDEX_CAPTURE_DIR: captureDir},
    });
    assertCaptures(captureDir, catalogCaptures, 'catalog', !updateCaptures);
    assertCaptures(captureDir, surfaceCaptures, 'production surface', !updateCaptures);
    process.stdout.write('\nClaudex Usage check: passed\n');
} finally {
    rmSync(temporaryRoot, {recursive: true, force: true});
}
