#!/usr/bin/env node

import {
    chmodSync,
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
    'usage-refinement-a-panel-dark-100.png',
    'usage-refinement-a-popup-dark-100.png',
    'usage-refinement-a-settings-dark-100.png',
    'usage-refinement-b-panel-dark-100.png',
    'usage-refinement-b-popup-dark-100.png',
    'usage-refinement-c-panel-dark-100.png',
    'usage-refinement-c-popup-dark-100.png',
];
const surfaceCaptures = [
    'surface-panel-dark-100.png',
    'surface-popup-dark-100.png',
    'surface-refresh-focus-hover.png',
    'surface-unavailable-popup.png',
    'surface-panel-light-100.png',
    'surface-panel-dark-200.png',
    'surface-settings-dark-100.png',
    'surface-settings-toggle-off-focus-hover.png',
    'surface-settings-cadence-focus-hover.png',
    'surface-settings-light-100.png',
    'surface-left-popup-dark-100.png',
    'surface-history-stepper-dark-100.png',
    'surface-history-stepper-light-100.png',
    'surface-history-stepper-dark-200.png',
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

function assertCommandRejects(command, args, expectedMessage, options = {}) {
    const result = spawnSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        ...options,
    });
    if (result.error)
        throw result.error;
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (result.status === 0 || !output.includes(expectedMessage))
        throw new Error(`${command} did not reject with ${expectedMessage}`);
}

function validateLegacySettingsSeed(source) {
    const requiredKeys = [
        'show-claude-short',
        'show-claude-weekly',
        'show-codex-weekly',
        'refresh-interval',
        'show-usage-history',
        'history-range',
    ];
    if (typeof source !== 'string' ||
        !source.includes('[org/gnome/shell/extensions/claudex-usage]') ||
        requiredKeys.some(key => !source.includes(`\n${key}=`)))
        throw new Error('legacy GSettings seed is incomplete');
    for (const additiveKey of ['usage-display', 'show-time-pace', 'weekly-pace']) {
        if (source.includes(`\n${additiveKey}=`))
            throw new Error(`legacy GSettings seed already contains ${additiveKey}`);
    }
    return source;
}

function legacySettingsSeed() {
    return validateLegacySettingsSeed(
        '[org/gnome/shell/extensions/claudex-usage]\n' +
        'show-claude-short=false\n' +
        'show-claude-weekly=true\n' +
        'show-codex-weekly=false\n' +
        "refresh-interval='fifteen-minutes'\n" +
        'show-usage-history=false\n' +
        "history-range='7d'\n");
}

function assertLegacySettingsSeedGuard() {
    const valid = legacySettingsSeed();
    for (const [line, key] of [
        ["usage-display='left'", 'usage-display'],
        ['show-time-pace=false', 'show-time-pace'],
        ["weekly-pace='weekdays'", 'weekly-pace'],
    ]) {
        let rejected = false;
        try {
            validateLegacySettingsSeed(`${valid}${line}\n`);
        } catch (error) {
            rejected = error.message ===
                `legacy GSettings seed already contains ${key}`;
        }
        if (!rejected)
            throw new Error(`legacy GSettings seed guard accepted ${key}`);
    }
    process.stdout.write('legacy GSettings seed guard: all verdicts passed\n');
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
                'panel-preferences.js', 'codex-contract.js', 'codex-runtime.js',
                'claude-contract.js', 'claude-runtime.js',
                'history-store.js', 'history-runtime.js',
                'schemas/org.gnome.shell.extensions.claudex-usage.gschema.xml',
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
    for (const required of ['surface-controller.js', 'panel-preferences.js',
        'codex-contract.js', 'codex-runtime.js',
        'claude-contract.js', 'claude-runtime.js',
        'history-store.js', 'history-runtime.js',
        'schemas/org.gnome.shell.extensions.claudex-usage.gschema.xml',
        'shared/primitives.js', 'tokens.json',
        'icons/claude.svg']) {
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

function assertProviderSourceSafety() {
    const source = ['codex-contract.js', 'codex-runtime.js',
        'claude-contract.js', 'claude-runtime.js']
        .map(file => readFileSync(path.join(root, 'extension', file), 'utf8')).join('\n');
    const forbidden = [/\bGio\.(?:Subprocess|AppInfo)\b/,
        /\bGLib\.(?:spawn|shell_parse_argv)\b/, /\b(?:AppSystem|GSettings)\b/,
        /\b(?:codex|claude)\s+(?:login|exec)\b/i, /\bconsole\.(?:log|warn|error)\s*\(/,
        /\.(?:replace_contents|create|append_to|move|copy)\s*\(/];
    const verify = value => {
        if (forbidden.some(pattern => pattern.test(value)))
            throw new Error('Provider source contains a launch, log, or persistence path');
    };
    verify(source);
    let rejected;
    try {
        verify(`${source}\nGio.Subprocess.new(['claude', 'login']);`);
    } catch { rejected = true; }
    if (!rejected)
        throw new Error('Provider source guard accepted a tainted fixture');
    process.stdout.write('Provider source guard: both verdicts passed\n');
}

function replaceExactly(file, before, after) {
    const source = readFileSync(file, 'utf8');
    if (source.split(before).length !== 2)
        throw new Error(`Expected one replacement in ${file}`);
    writeFileSync(file, source.replace(before, after));
}

function prepareProductionVariant(sourceDir, packageDir, edits) {
    cpSync(path.join(root, 'extension'), sourceDir, {recursive: true});
    copyFileSync(path.join(root, 'design/system/tokens.json'),
        path.join(sourceDir, 'tokens.json'));
    cpSync(path.join(root, 'design/direction-lab/icons'),
        path.join(sourceDir, 'icons'), {recursive: true});
    edits(sourceDir);
    run('gnome-extensions', [
        'pack', '--force',
        '--schema=schemas/org.gnome.shell.extensions.claudex-usage.gschema.xml',
        '--extra-source=surface-controller.js', '--extra-source=panel-preferences.js',
        '--extra-source=codex-contract.js', '--extra-source=codex-runtime.js',
        '--extra-source=claude-contract.js', '--extra-source=claude-runtime.js',
        '--extra-source=history-store.js', '--extra-source=history-runtime.js',
        '--extra-source=shared',
        '--extra-source=tokens.json', '--extra-source=icons',
        '--out-dir', packageDir, sourceDir,
    ]);
    return path.join(packageDir, 'claudex-usage@hugo.local.shell-extension.zip');
}

function assertCaptures(captureDir, captures, label, compareCanonical) {
    for (const filename of captures) {
        const bytes = readFileSync(path.join(captureDir, filename));
        const pngSignature = bytes.subarray(0, 8).toString('hex');
        if (pngSignature !== '89504e470d0a1a0a' || bytes.length < 256)
            throw new Error(`${filename} is not a non-empty PNG capture`);
        if (compareCanonical) {
            // Popup actor bounds include five pixels of global panel chrome whose
            // active-indicator antialiasing is outside the extension actor tree.
            const comparableImage = filePath => filename.includes('panel')
                ? [filePath]
                : ['(', filePath, '-crop', '99999x99999+0+5', '+repage', ')'];
            const result = spawnSync('compare', [
                '-metric', 'AE',
                ...comparableImage(path.join(root, 'design/captures', filename)),
                ...comparableImage(path.join(captureDir, filename)),
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
    FooterStatus,
    HistoryChart,
    IconButton,
    PanelIndicator,
    PopoverScaffold,
    ProgressBar,
    ProviderGroup,
    RangeSelector,
    setProgressBarPace,
    SettingsRow,
    Switch,
    UsageMetric,
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
                values: [
                    {
                        id: 'burst',
                        percent: 37.5,
                        accessibleName: 'Burst window, 37.5 percent',
                        tone: 'muted',
                    },
                    {id: 'season', percent: 62.5},
                ],
            }],
            tokens,
        });
        this.compactProvider = ProviderGroup({
            model: {
                id: 'compact-provider',
                label: 'Compact provider',
                iconPath: '/tmp/noncanonical-compact.svg',
                iconAccessibleName: 'Compact provider mark',
            },
            tokens,
        });
        this.detailedProvider = ProviderGroup({
            model: {
                id: 'detailed-provider',
                label: 'Detailed provider',
                detail: 'Optional detail',
                iconPath: '/tmp/noncanonical-detailed.svg',
                iconAccessibleName: 'Detailed provider mark',
            },
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
        this.refreshIdle = IconButton({
            id: 'proof-refresh-idle',
            iconName: 'view-refresh-symbolic',
            accessibleName: 'Refresh proof',
            onActivate: () => {},
            tokens,
        });
        this.refreshBusy = IconButton({
            id: 'proof-refresh-busy',
            iconName: 'process-working-symbolic',
            accessibleName: 'Refreshing proof',
            onActivate: () => {},
            tokens,
            busy: true,
        });
        this.footer = FooterStatus({status: 'Updated 1 min ago'});
        this.actionFooter = FooterStatus({
            status: 'Updated just now',
            action: {
                id: 'proof-footer-action',
                label: 'Act',
                accessibleName: 'Act on proof',
                onActivate: () => {},
            },
        });
        this.metric = UsageMetric({
            metric: {
                id: 'proof--burst',
                label: 'Burst window',
                percent: 37.5,
                resetLabel: 'Resets in 1 hr',
                accessibleName: 'Burst window at 37.5 percent',
                dataRole: 'dataCodexWeekly',
            },
            tokens,
        });
        this.progress = ProgressBar({
            metric: {
                id: 'burstLoad',
                percent: 37.5,
                pacePercent: 37.5,
                accessibleName: 'Burst load at 37.5 percent',
                dataRole: 'dataCodexWeekly',
            },
            tokens,
        });
        this.plainProgress = ProgressBar({
            metric: {
                id: 'plainLoad',
                percent: 62.5,
                accessibleName: 'Plain load at 62.5 percent',
                dataRole: 'dataClaudeWeekly',
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
            children: [this.panel, this.compactProvider, this.detailedProvider,
                this.progress, this.plainProgress, this.range, this.setting,
                this.refreshIdle, this.refreshBusy, this.footer,
                this.actionFooter, this.metric, this.chart],
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
            compactProvider: this.compactProvider,
            detailedProvider: this.detailedProvider,
            range: this.range,
            setting: this.setting,
            refreshIdle: this.refreshIdle,
            refreshBusy: this.refreshBusy,
            footer: this.footer,
            actionFooter: this.actionFooter,
            metric: this.metric,
            progress: this.progress,
            plainProgress: this.plainProgress,
            events: this.events,
            destroyed: this.destroyed,
        };
    }

    setProofPace(actor, percent) {
        setProgressBarPace(actor, percent);
    }

    validationFailures() {
        const baseSeries = {id: 'line', values: [0, 100],
            dataRole: 'dataClaudeShort', strokeWidth: 1};
        const probes = [
            ['unsafe id', () => validatePresentationModels({ids: ['unsafe id']})],
            ['duplicate id', () => validatePresentationModels({ids: ['same', 'same']})],
            ['not-a-number percent', () => validatePresentationModels({percentages: [NaN]})],
            ['negative percent', () => validatePresentationModels({percentages: [-1]})],
            ['overflow percent', () => validatePresentationModels({percentages: [101]})],
            ['empty history', () => validatePresentationModels({historySeries: []})],
            ['short history', () => validatePresentationModels({historySeries: [
                {...baseSeries, values: [1]},
            ]})],
            ['unequal history', () => validatePresentationModels({historySeries: [
                baseSeries,
                {...baseSeries, id: 'other', values: [0, 1, 2]},
            ]})],
            ['infinite history', () => validatePresentationModels({historySeries: [
                {...baseSeries, values: [0, Infinity]},
            ]})],
            ['empty ranges', () => validatePresentationModels(
                {rangeChoices: [], selectedRange: 'x'})],
            ['duplicate ranges', () => validatePresentationModels({rangeChoices: [
                {id: 'x'}, {id: 'x'},
            ], selectedRange: 'x'})],
            ['unknown range', () => validatePresentationModels(
                {rangeChoices: [{id: 'x'}], selectedRange: 'y'})],
            ['null callback', () => validatePresentationModels({callbacks: [null]})],
            ['empty accessible name', () => validatePresentationModels(
                {accessibleNames: ['']})],
            ['unsafe data role', () => validatePresentationModels(
                {dataRoles: ['unsafe role']})],
            ['unknown data role', () => validatePresentationModels({
                dataRoles: ['dataMissing'],
                tokens: this.tokens,
            })],
            ['invalid switch', () => Switch({active: 'false', tokens: this.tokens})],
            ['invalid busy string', () => IconButton({
                id: 'bad-busy',
                iconName: 'view-refresh-symbolic',
                accessibleName: 'Bad busy',
                onActivate: () => {},
                tokens: this.tokens,
                busy: 'true',
            })],
            ['invalid busy null', () => IconButton({
                id: 'bad-busy-null',
                iconName: 'view-refresh-symbolic',
                accessibleName: 'Bad busy null',
                onActivate: () => {},
                tokens: this.tokens,
                busy: null,
            })],
            ['invalid panel tone', () => PanelIndicator({
                id: 'bad-tone-panel',
                groups: [{
                    id: 'aurora',
                    iconPath: '/tmp/noncanonical-aurora.svg',
                    accessibleName: 'Aurora',
                    values: [{id: 'burst', percent: 37.5, tone: 'quiet'}],
                }],
                tokens: this.tokens,
            })],
            ['invalid panel value accessible name', () => PanelIndicator({
                id: 'bad-value-name-panel',
                groups: [{
                    id: 'aurora',
                    iconPath: '/tmp/noncanonical-aurora.svg',
                    accessibleName: 'Aurora',
                    values: [{id: 'burst', percent: 37.5, accessibleName: ''}],
                }],
                tokens: this.tokens,
            })],
            ['invalid provider detail', () => ProviderGroup({
                model: {
                    id: 'bad-provider',
                    label: 'Bad provider',
                    detail: '',
                    iconPath: '/tmp/noncanonical-bad.svg',
                    iconAccessibleName: 'Bad provider mark',
                },
                tokens: this.tokens,
            })],
            ['invalid pace null', () => ProgressBar({
                metric: {
                    id: 'bad-pace-null',
                    percent: 37.5,
                    pacePercent: null,
                    accessibleName: 'Bad pace null',
                    dataRole: 'dataCodexWeekly',
                },
                tokens: this.tokens,
            })],
            ['invalid pace overflow', () => ProgressBar({
                metric: {
                    id: 'bad-pace-overflow',
                    percent: 37.5,
                    pacePercent: 101,
                    accessibleName: 'Bad pace overflow',
                    dataRole: 'dataCodexWeekly',
                },
                tokens: this.tokens,
            })],
            ['pace track too narrow', () => ProgressBar({
                metric: {
                    id: 'bad-pace-track',
                    percent: 37.5,
                    pacePercent: 50,
                    accessibleName: 'Bad pace track',
                    dataRole: 'dataCodexWeekly',
                },
                tokens: {
                    ...this.tokens,
                    size: {...this.tokens.size, progressWidth: 1},
                },
            })],
            ['empty footer status', () => FooterStatus({status: ''})],
            ['invalid footer action', () => FooterStatus({
                status: 'Ready',
                action: {id: 'bad-action', label: 'Act',
                    accessibleName: 'Bad action'},
            })],
        ];
        return Object.fromEntries(probes.map(([name, probe]) => {
            try {
                probe();
                return [name, false];
            } catch {
                return [name, true];
            }
        }));
    }

    destroyProof() {
        this.root?.destroy();
        this.root = null;
    }

    disable() {
        this.destroyProof();
        this.range = null;
        this.panel = null;
        this.compactProvider = null;
        this.detailedProvider = null;
        this.setting = null;
        this.refreshIdle = null;
        this.refreshBusy = null;
        this.footer = null;
        this.actionFooter = null;
        this.metric = null;
        this.progress = null;
        this.plainProgress = null;
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
function rejects(callback) {
    try {
        callback();
        return false;
    } catch {
        return true;
    }
}
function findActor(root, name) {
    if (root?.get_name?.() === name)
        return root;
    for (const child of root?.get_children?.() ?? []) {
        const found = findActor(child, name);
        if (found)
            return found;
    }
    return null;
}
function hasState(actor, state) {
    return actor.get_accessible().ref_state_set().contains_state(state);
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
    const mutedPanelValue = findActor(proof.panel, 'panel-value-aurora--burst');
    const defaultPanelValue = findActor(proof.panel, 'panel-value-aurora--season');
    assert(mutedPanelValue.has_style_class_name('muted') &&
        mutedPanelValue.get_accessible_name() ===
            'Burst window, 37.5 percent' &&
        !defaultPanelValue.has_style_class_name('muted') &&
        defaultPanelValue.get_accessible_name() === '62.5 percent',
    'panel values support explicit muted tone and accessible-name defaults');
    assert(proof.compactProvider.get_children()[1].get_children().length === 1 &&
        proof.detailedProvider.get_children()[1].get_children().length === 2,
    'provider detail is explicitly optional');
    assert(proof.progress.accessible_role === Atk.Role.PROGRESS_BAR,
        'progress role is preserved');
    assert(proof.progress.get_accessible_name() ===
        'Burst load at 37.5 percent', 'progress accessible name is model-driven');
    const paceMarker = findActor(proof.progress, 'pace-burstLoad');
    const progressChildren = proof.progress.get_children();
    assert(paceMarker?.x === 118 &&
        progressChildren[progressChildren.length - 1] === paceMarker &&
        !findActor(proof.plainProgress, 'pace-plainLoad'),
    'optional Time pace marker uses canonical geometry and stacks above the fill');
    extension.setProofPace(proof.progress, 100);
    assert(paceMarker.x === 314 &&
        rejects(() => extension.setProofPace(proof.plainProgress, 50)) &&
        rejects(() => extension.setProofPace(proof.progress, -1)),
    'Time pace setter clamps endpoints and rejects plain or invalid bars');
    const choices = proof.range.get_children();
    assert(choices[0].accessible_role === Atk.Role.RADIO_BUTTON,
        'range role is preserved');
    assert(proof.setting.accessible_role === Atk.Role.SWITCH,
        'settings role is preserved');
    assert(!proof.refreshIdle.has_style_class_name('busy') &&
        !hasState(proof.refreshIdle, Atk.StateType.BUSY) &&
        proof.refreshBusy.has_style_class_name('busy') &&
        hasState(proof.refreshBusy, Atk.StateType.BUSY),
    'icon button busy state is explicit and defaults off');
    assert(proof.footer.get_children().length === 1 &&
        findActor(proof.footer, 'footer-status')?.text === 'Updated 1 min ago' &&
        findActor(proof.actionFooter, 'proof-footer-action'),
    'footer supports status-only and explicit-action consumers');
    const reset = findActor(proof.metric, 'reset-label-proof--burst');
    assert(reset?.text === 'Resets in 1 hr',
        'usage metric exposes its stable reset-label actor contract');
    choices[0].emit('clicked', 1);
    proof.setting.emit('clicked', 1);
    assert(JSON.stringify(proof.events) ===
        JSON.stringify([['range', 'burst'], ['toggle', 'ambientMode']]),
        'callbacks receive stable model ids');
    for (const [name, rejected] of Object.entries(extension.validationFailures()))
        assert(rejected, \`invalid presentation model fails closed: \${name}\`);
    const destroyedProgress = proof.progress;
    extension.destroyProof();
    assert(extension.getProof().root === null && extension.getProof().destroyed &&
        rejects(() => extension.setProofPace(destroyedProgress, 50)),
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
const settingsFixtureDir = path.join(temporaryRoot, 'settings-fixture');
const fixtureSourceDir = path.join(temporaryRoot, 'fixture-source');
const fixturePackageDir = path.join(temporaryRoot, 'fixture-package');
const journeySourceDir = path.join(temporaryRoot, 'journey-source');
const journeyPackageDir = path.join(temporaryRoot, 'journey-package');
const claudeJourneySourceDir = path.join(temporaryRoot, 'claude-journey-source');
const claudeJourneyPackageDir = path.join(temporaryRoot, 'claude-journey-package');
const fixtureProcRoot = path.join(temporaryRoot, 'empty-proc');
const journeyProcRoot = path.join(temporaryRoot, 'journey-proc');
const claudeJourneyProcRoot = path.join(temporaryRoot, 'claude-journey-proc');
const codexHome = path.join(temporaryRoot, 'codex-home');
const claudeConfigHome = path.join(temporaryRoot, 'claude-home');
const codexAdapterHistoryDir = path.join(temporaryRoot, 'codex-adapter-history');
const claudeAdapterHistoryDir = path.join(temporaryRoot, 'claude-adapter-history');
const claudeHistoryDir = path.join(temporaryRoot, 'claude-history');
const surfaceHistoryDir = path.join(temporaryRoot, 'surface-history');
const settingsHistoryDir = path.join(temporaryRoot, 'settings-history');
const missingSettingsFixtureDir = path.join(temporaryRoot, 'missing-settings-fixture');
const missingSettingsConfigDir = path.join(temporaryRoot, 'missing-settings-config');
const fakeCodex = path.join(temporaryRoot, 'codex');
const fakeClaude = path.join(temporaryRoot, 'claude');
const captureDir = updateCaptures
    ? path.join(root, 'design/captures')
    : path.join(temporaryRoot, 'captures');
for (const directory of [packageDir, productionPackageDir, proofPackageDir,
    captureDir, settingsFixtureDir, fixturePackageDir, journeyPackageDir,
    claudeJourneyPackageDir, fixtureProcRoot, journeyProcRoot, claudeJourneyProcRoot,
    codexHome, claudeConfigHome, codexAdapterHistoryDir,
    claudeAdapterHistoryDir, claudeHistoryDir, surfaceHistoryDir,
    settingsHistoryDir])
    mkdirSync(directory, {recursive: true});
assertLegacySettingsSeedGuard();
assertCommandRejects('sh', [path.join(root, 'scripts/gsettings-session-wrapper.sh'),
    '/usr/bin/true'], 'missing validated legacy GSettings seed', {
    env: {
        ...process.env,
        XDG_CONFIG_HOME: missingSettingsConfigDir,
        CLAUDEX_GSETTINGS_FIXTURE_DIR: missingSettingsFixtureDir,
        CLAUDEX_J003_PHASE: 'write',
    },
});
process.stdout.write('GSettings session wrapper: missing-seed rejection passed\n');
writeFileSync(path.join(settingsFixtureDir, 'legacy-keyfile'), legacySettingsSeed());
writeFileSync(path.join(codexHome, 'auth.json'),
    JSON.stringify({tokens: {access_token: 'journey-token'}}));
writeFileSync(path.join(claudeConfigHome, '.credentials.json'),
    JSON.stringify({claudeAiOauth: {accessToken: 'journey-token'}}));
copyFileSync('/usr/bin/python3', fakeCodex);
chmodSync(fakeCodex, 0o700);
copyFileSync('/usr/bin/python3', fakeClaude);
chmodSync(fakeClaude, 0o700);

try {
    run('node', ['scripts/doc-lint.mjs', 'docs/product', 'docs/engineering']);
    run('node', ['scripts/render-catalog-styles.mjs', '--check']);
    run('node', ['--test', 'tests/unit/catalog-state.test.js',
        'tests/unit/claude-contract.test.js',
        'tests/unit/codex-contract.test.js',
        'tests/unit/design-tokens.test.js', 'tests/unit/history-store.test.js',
        'tests/unit/panel-preferences.test.js',
        'tests/unit/surface-controller.test.js',
        'tests/unit/weekday-pace-timezone.test.js']);
    run('gjs', ['-m', 'tests/unit/codex-adapter.test.js']);
    run('gjs', ['-m', 'tests/unit/claude-adapter.test.js']);
    run('gjs', ['-m', 'tests/unit/history-runtime.test.js']);
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
        '--schema=schemas/org.gnome.shell.extensions.claudex-usage.gschema.xml',
        '--extra-source=surface-controller.js',
        '--extra-source=panel-preferences.js',
        '--extra-source=codex-contract.js',
        '--extra-source=codex-runtime.js',
        '--extra-source=claude-contract.js',
        '--extra-source=claude-runtime.js',
        '--extra-source=history-store.js',
        '--extra-source=history-runtime.js',
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
        'panel-preferences.js',
        'codex-contract.js',
        'codex-runtime.js',
        'claude-contract.js',
        'claude-runtime.js',
        'history-store.js',
        'history-runtime.js',
        'schemas/org.gnome.shell.extensions.claudex-usage.gschema.xml',
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
    assertProviderSourceSafety();
    const neutralizeProcRoot = (sourceDir, runtimeClass, procRoot) =>
        replaceExactly(path.join(sourceDir, 'extension.js'),
            `new ${runtimeClass}()`,
            `new ${runtimeClass}({procRoot: ${JSON.stringify(procRoot)}})`);
    const fixtureZipPath = prepareProductionVariant(
        fixtureSourceDir, fixturePackageDir, sourceDir => {
            replaceExactly(path.join(sourceDir, 'codex-runtime.js'),
                "        id: 'codex',", "        id: 'codex-installed-fixture',");
            replaceExactly(path.join(sourceDir, 'claude-runtime.js'),
                "        id: 'claude',", "        id: 'claude-installed-fixture',");
            neutralizeProcRoot(sourceDir, 'CodexRuntime', fixtureProcRoot);
            neutralizeProcRoot(sourceDir, 'ClaudeRuntime', fixtureProcRoot);
        });
    const journeyZipPath = prepareProductionVariant(
        journeySourceDir, journeyPackageDir, sourceDir => {
            replaceExactly(path.join(sourceDir, 'codex-runtime.js'),
                'https://chatgpt.com/backend-api/wham/usage',
                'http://127.0.0.1:19876/usage');
            neutralizeProcRoot(sourceDir, 'CodexRuntime', journeyProcRoot);
            neutralizeProcRoot(sourceDir, 'ClaudeRuntime', fixtureProcRoot);
        });
    run('dbus-run-session', ['--', 'gnome-shell-test-tool', '--devkit',
        '--disable-animations', '--extension', journeyZipPath,
        'tests/journeys/J-004-codex-usage.journey.test.js',
    ], {
        env: {...process.env, GSETTINGS_BACKEND: 'memory',
            CODEX_HOME: codexHome, CLAUDEX_FAKE_CODEX: fakeCodex,
            CLAUDEX_PROC_ROOT: journeyProcRoot,
            CLAUDEX_HISTORY_DIR: codexAdapterHistoryDir},
    });
    const claudeJourneyZipPath = prepareProductionVariant(
        claudeJourneySourceDir, claudeJourneyPackageDir, sourceDir => {
            replaceExactly(path.join(sourceDir, 'claude-runtime.js'),
                'https://api.anthropic.com/api/oauth/usage',
                'http://127.0.0.1:19876/usage');
            neutralizeProcRoot(sourceDir, 'ClaudeRuntime', claudeJourneyProcRoot);
            neutralizeProcRoot(sourceDir, 'CodexRuntime', fixtureProcRoot);
        });
    run('dbus-run-session', ['--', 'gnome-shell-test-tool', '--devkit',
        '--disable-animations', '--extension', claudeJourneyZipPath,
        'tests/journeys/J-005-claude-usage.journey.test.js',
    ], {
        env: {...process.env, GSETTINGS_BACKEND: 'memory',
            CLAUDE_CONFIG_DIR: claudeConfigHome,
            CLAUDEX_FAKE_CLAUDE: fakeClaude, CLAUDEX_PROC_ROOT: claudeJourneyProcRoot,
            CLAUDEX_HISTORY_DIR: claudeAdapterHistoryDir},
    });
    const seedNow = Date.now();
    const seedSample = (hoursAgo, percent) => [seedNow - hoursAgo * 3600 * 1000, percent];
    writeFileSync(path.join(claudeHistoryDir, 'history.json'), JSON.stringify({
        version: 1,
        windows: {
            'claude:short': [seedSample(7, 8), seedSample(3, 14), seedSample(1, 11)],
            'claude:weekly': [seedSample(7, 60), seedSample(3, 63), seedSample(1, 66)],
        },
    }));
    run('dbus-run-session', ['--', 'gnome-shell-test-tool', '--devkit',
        '--disable-animations', '--extension', claudeJourneyZipPath,
        'tests/journeys/J-006-usage-history.journey.test.js',
    ], {
        env: {...process.env, GSETTINGS_BACKEND: 'memory',
            CLAUDE_CONFIG_DIR: claudeConfigHome,
            CLAUDEX_FAKE_CLAUDE: fakeClaude, CLAUDEX_PROC_ROOT: claudeJourneyProcRoot,
            CLAUDEX_HISTORY_DIR: claudeHistoryDir, CLAUDEX_CAPTURE_DIR: captureDir},
    });
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
    for (const phase of ['write', 'restore']) {
        run('dbus-run-session', [
            '--',
            'gnome-shell-test-tool',
            '--devkit',
            '--disable-animations',
            '--wrap', path.join(root, 'scripts/gsettings-session-wrapper.sh'),
            '--extension', fixtureZipPath,
            'tests/journeys/J-003-panel-preferences.journey.test.js',
        ], {
            env: {
                ...process.env,
                CLAUDEX_CAPTURE_DIR: captureDir,
                CLAUDEX_GSETTINGS_FIXTURE_DIR: settingsFixtureDir,
                CLAUDEX_J003_PHASE: phase,
                CLAUDEX_HISTORY_DIR: settingsHistoryDir,
            },
        });
    }
    run('dbus-run-session', [
        '--',
        'gnome-shell-test-tool',
        '--devkit',
        '--disable-animations',
        '--extension', fixtureZipPath,
        'tests/journeys/J-002-usage-surface.journey.test.js',
    ], {
        env: {...process.env, GSETTINGS_BACKEND: 'memory',
            CLAUDEX_CAPTURE_DIR: captureDir,
            CLAUDEX_HISTORY_DIR: surfaceHistoryDir},
    });
    assertCaptures(captureDir, catalogCaptures, 'catalog', !updateCaptures);
    assertCaptures(captureDir, surfaceCaptures, 'production surface', !updateCaptures);
    process.stdout.write('\nClaudex Usage check: passed\n');
} finally {
    rmSync(temporaryRoot, {recursive: true, force: true});
}
