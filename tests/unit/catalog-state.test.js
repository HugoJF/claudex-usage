import assert from 'node:assert/strict';
import test from 'node:test';

import {CatalogState} from '../../design/direction-lab/catalog-state.js';
import {
    colorToRgba,
    progressWidth,
} from '../../extension/shared/token-geometry.js';

test('catalog state starts in the selected Direction D review state', () => {
    const state = new CatalogState();
    assert.deepEqual(state.snapshot(), {
        view: 'usage',
        activeRange: '6h',
        refreshInterval: '5 min',
        showClaudeShort: true,
        showClaudeWeekly: true,
        showCodexWeekly: true,
        presentOnly: true,
        localHistory: true,
        timePace: true,
        weeklyPace: 'Every day',
        refinementVariant: null,
    });
});

test('catalog state changes ranges and settings without persistence', () => {
    const state = new CatalogState();
    state.selectRange('7d');
    state.toggle('showClaudeShort');
    state.setView('settings');
    assert.equal(state.snapshot().activeRange, '7d');
    assert.equal(state.snapshot().showClaudeShort, false);
    assert.equal(state.snapshot().view, 'settings');
    assert.throws(() => state.selectRange('forever'), /Unknown history range/);
    assert.throws(() => state.toggle('networkAccess'), /Unknown catalog toggle/);
    assert.throws(() => state.setView('provider-auth'), /Unknown catalog view/);
});

test('refinement variants reset the review state and keep Time pace toggleable', () => {
    const state = new CatalogState();
    state.selectRange('30d');
    state.setView('settings');
    state.setRefinementVariant('b');
    assert.equal(state.snapshot().refinementVariant, 'b');
    assert.equal(state.snapshot().view, 'usage');
    assert.equal(state.snapshot().activeRange, '6h');
    assert.equal(state.cycleRange(), '1d');
    assert.equal(state.toggle('timePace'), false);
    assert.throws(() => state.setRefinementVariant('dense'),
        /Unknown refinement variant/);
});

test('refresh choice cycles deterministically in process-local state', () => {
    const state = new CatalogState();
    assert.equal(state.cycleRefreshInterval(), '10 min');
    assert.equal(state.cycleRefreshInterval(), '15 min');
    assert.equal(state.cycleRefreshInterval(), '5 min');
});

test('weekly pace cycles between every day and weekdays', () => {
    const state = new CatalogState();
    assert.equal(state.cycleWeeklyPace(), 'Weekdays');
    assert.equal(state.cycleWeeklyPace(), 'Every day');
});

test('progress geometry clamps, rounds, and stays monotonic at multiple widths', () => {
    assert.equal(progressWidth(0, 316), 0);
    assert.equal(progressWidth(8, 316), 25);
    assert.equal(progressWidth(8.4, 316), 27);
    assert.equal(progressWidth(50, 316), 158);
    assert.equal(progressWidth(100, 316), 316);
    assert.equal(progressWidth(-10, 316), 0);
    assert.equal(progressWidth(120, 316), 316);
    for (const width of [0, 1, 17, 316]) {
        let previous = -1;
        for (let percent = 0; percent <= 100; percent += 0.5) {
            const current = progressWidth(percent, width);
            assert.ok(current >= previous);
            previous = current;
        }
        assert.equal(progressWidth(0, width), 0);
        assert.equal(progressWidth(100, width), width);
    }
    assert.throws(() => progressWidth(Number.NaN, 316), /finite/);
    assert.throws(() => progressWidth(20, Number.POSITIVE_INFINITY), /finite/);
    assert.throws(() => progressWidth(20, -1), /non-negative/);
});

test('one strict CSS parser produces normalized Cairo channels', () => {
    assert.deepEqual(colorToRgba('#ff8000'), [1, 128 / 255, 0, 1]);
    assert.deepEqual(colorToRgba('rgb(0, 127.5, 255)'), [0, 0.5, 1, 1]);
    assert.deepEqual(colorToRgba('rgba(0, 255, 1, 0)'), [0, 1, 1 / 255, 0]);
    assert.deepEqual(colorToRgba('rgba(0, 255, 1, 1)'), [0, 1, 1 / 255, 1]);
    assert.deepEqual(colorToRgba('rgba(255, 255, 255, 0.10)'), [1, 1, 1, 0.1]);
    assert.throws(() => colorToRgba('rgb(256, 0, 0)'), /out of range/);
    assert.throws(() => colorToRgba('rgb(-1, 0, 0)'), /out of range/);
    assert.throws(() => colorToRgba('rgba(0, 0, 0, 1.01)'), /out of range/);
    assert.throws(() => colorToRgba('rgba(0, 0, nope, 1)'), /Unsupported/);
    assert.throws(() => colorToRgba('rebeccapurple'), /Unsupported color/);
});
