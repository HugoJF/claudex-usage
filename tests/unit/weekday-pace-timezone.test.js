import assert from 'node:assert/strict';
import test from 'node:test';

import {SurfaceController} from '../../extension/surface-controller.js';

process.env.TZ = 'America/New_York';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function weekdayPercent(startAtMs, nowMs) {
    const resetAtMs = startAtMs + WEEK_MS;
    const controller = new SurfaceController({
        now: () => nowMs,
        schedule: () => 1,
        cancel: () => {},
    });
    controller.registerProvider({
        id: 'timezone',
        order: 0,
        label: 'Timezone',
        detail: 'DST fixture',
        marks: {
            darkPanel: 'icons/dark.svg',
            lightPanel: 'icons/light.svg',
            popup: 'icons/popup.svg',
            accessibleName: 'Timezone mark',
        },
        windows: [{
            id: 'weekly',
            label: 'Weekly window',
            dataRole: 'dataCodexWeekly',
            durationMs: WEEK_MS,
        }],
        isEligible: () => true,
        subscribeEligibility: () => () => {},
        refresh: async () => ({
            status: 'available',
            readings: [{id: 'weekly', percent: 0, resetAtMs}],
        }),
    });
    await new Promise(resolve => setImmediate(resolve));
    return {
        percent: controller.getSnapshot().providers[0].metrics[0]
            .weekdayElapsedPercent,
        resetAtMs,
    };
}

test('spring-forward counts 121 weekday hours in an exact epoch week', async () => {
    const startAtMs = new Date(2026, 2, 3, 12).getTime();
    const mondayAtMidnight = new Date(2026, 2, 9, 0).getTime();
    const result = await weekdayPercent(startAtMs, mondayAtMidnight);
    assert.equal(new Date(result.resetAtMs).getHours(), 13);
    assert(Math.abs(result.percent - 84 / 121 * 100) < 1e-10);
});

test('fall-back counts 119 weekday hours in an exact epoch week', async () => {
    const startAtMs = new Date(2026, 9, 27, 12).getTime();
    const mondayAtMidnight = new Date(2026, 10, 2, 0).getTime();
    const result = await weekdayPercent(startAtMs, mondayAtMidnight);
    assert.equal(new Date(result.resetAtMs).getHours(), 11);
    assert(Math.abs(result.percent - 84 / 119 * 100) < 1e-10);
});
