import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDirectorSample, normalizeDirectorSample, sampleDirectorSignals } from '../extension/director-sampling.js';

test('director sampling is stable for a generation seed', () => {
    assert.deepEqual(sampleDirectorSignals('fun', 731), sampleDirectorSignals('fun', 731));
    assert.notDeepEqual(sampleDirectorSignals('fun', 731), sampleDirectorSignals('fun', 732));
});

test('mode weights materially increase major and surprising results in Fun', () => {
    const counts = mode => {
        const result = { major: 0, surprising: 0 };
        for (let seed = 1; seed <= 10000; seed++) {
            const sample = sampleDirectorSignals(mode, seed);
            if (sample.intervention === 'major') result.major++;
            if (sample.novelty === 'surprising') result.surprising++;
        }
        return result;
    };
    const light = counts('light');
    const balanced = counts('balanced');
    const fun = counts('fun');
    assert.ok(light.major < balanced.major && balanced.major < fun.major, JSON.stringify({ light, balanced, fun }));
    assert.ok(light.surprising < balanced.surprising && balanced.surprising < fun.surprising, JSON.stringify({ light, balanced, fun }));
    assert.ok(fun.major > 5000, JSON.stringify(fun));
    assert.ok(fun.surprising > 5000, JSON.stringify(fun));
});

test('formatted samples invite broad contextual movement without prescribing an event taxonomy', () => {
    const prompt = formatDirectorSample({ mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'adverse' });
    assert.match(prompt, /story-altering development/i);
    assert.match(prompt, /unexpected but context-compatible/i);
    assert.match(prompt, /academic, domestic, institutional, political, investigative, battlefield, fantastical/i);
    assert.match(prompt, /creative appetite, not a menu/i);
});

test('invalid persisted samples normalize safely', () => {
    assert.deepEqual(normalizeDirectorSample({ mode: 'wrong', intervention: 'impossible' }), {
        mode: 'balanced', intervention: 'meaningful', novelty: 'open', fortune: 'mixed',
    });
});
