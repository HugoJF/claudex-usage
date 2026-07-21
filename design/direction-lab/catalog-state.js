export const LIMIT_KEYS = Object.freeze([
    'showClaudeShort',
    'showClaudeWeekly',
    'showCodexWeekly',
]);

export const RANGES = Object.freeze(['1h', '6h', '1d', '7d', '30d']);
export const REFINEMENT_VARIANTS = Object.freeze(['a', 'b', 'c']);

export const USAGE = Object.freeze({
    claudeShort: Object.freeze({
        id: 'claudeShort',
        provider: 'Claude',
        window: '5-hour window',
        percent: 8,
        pacePercent: 23,
        reset: 'Resets in 3 hr, 50 min',
        dataRole: 'dataClaudeShort',
    }),
    claudeWeekly: Object.freeze({
        id: 'claudeWeekly',
        provider: 'Claude',
        window: 'Weekly window',
        percent: 68,
        pacePercent: 76,
        reset: 'Resets in 1 day, 17 hr',
        dataRole: 'dataClaudeWeekly',
    }),
    codexWeekly: Object.freeze({
        id: 'codexWeekly',
        provider: 'Codex',
        window: 'Weekly window',
        percent: 42,
        pacePercent: 42,
        reset: 'Resets in 4 days, 2 hr',
        dataRole: 'dataCodexWeekly',
    }),
});

export const HISTORY = Object.freeze({
    claudeShort: Object.freeze([
        2, 2, 2, 7, 7, 7, 11, 11, 13, 13, 13, 16, 18, 21, 23, 24, 26,
        27, 29, 29, 31, 31, 34, 36, 4, 7, 8, 8, 8, 8,
    ]),
    claudeWeekly: Object.freeze([
        61, 61, 62, 62, 62, 63, 63, 63, 63, 64, 64, 64, 64, 64, 65,
        65, 65, 65, 66, 66, 66, 66, 67, 67, 67, 67, 68, 68, 68, 68,
    ]),
    codexWeekly: Object.freeze([
        27, 27, 28, 28, 29, 30, 30, 31, 31, 32, 33, 34, 34, 35, 36,
        36, 37, 37, 38, 38, 39, 39, 40, 40, 40, 41, 41, 41, 42, 42,
    ]),
});

export class CatalogState {
    constructor() {
        this.view = 'usage';
        this.activeRange = '6h';
        this.refreshInterval = '5 min';
        this.showClaudeShort = true;
        this.showClaudeWeekly = true;
        this.showCodexWeekly = true;
        this.presentOnly = true;
        this.localHistory = true;
        this.timePace = true;
        this.weeklyPace = 'Every day';
        this.refinementVariant = null;
    }

    setView(view) {
        if (!['usage', 'settings'].includes(view))
            throw new Error(`Unknown catalog view: ${view}`);
        this.view = view;
    }

    selectRange(range) {
        if (!RANGES.includes(range))
            throw new Error(`Unknown history range: ${range}`);
        this.activeRange = range;
    }

    cycleRange() {
        const index = RANGES.indexOf(this.activeRange);
        this.activeRange = RANGES[(index + 1) % RANGES.length];
        return this.activeRange;
    }

    setRefinementVariant(variant) {
        if (!REFINEMENT_VARIANTS.includes(variant))
            throw new Error(`Unknown refinement variant: ${variant}`);
        this.refinementVariant = variant;
        this.view = 'usage';
        this.activeRange = '6h';
        this.timePace = true;
        this.weeklyPace = 'Every day';
    }

    toggle(key) {
        if (![...LIMIT_KEYS, 'presentOnly', 'localHistory', 'timePace'].includes(key))
            throw new Error(`Unknown catalog toggle: ${key}`);
        this[key] = !this[key];
        return this[key];
    }

    cycleRefreshInterval() {
        const intervals = ['5 min', '10 min', '15 min'];
        const index = intervals.indexOf(this.refreshInterval);
        this.refreshInterval = intervals[(index + 1) % intervals.length];
        return this.refreshInterval;
    }

    cycleWeeklyPace() {
        this.weeklyPace = this.weeklyPace === 'Every day' ? 'Weekdays' : 'Every day';
        return this.weeklyPace;
    }

    snapshot() {
        return Object.freeze({
            view: this.view,
            activeRange: this.activeRange,
            refreshInterval: this.refreshInterval,
            showClaudeShort: this.showClaudeShort,
            showClaudeWeekly: this.showClaudeWeekly,
            showCodexWeekly: this.showCodexWeekly,
            presentOnly: this.presentOnly,
            localHistory: this.localHistory,
            timePace: this.timePace,
            weeklyPace: this.weeklyPace,
            refinementVariant: this.refinementVariant,
        });
    }
}
