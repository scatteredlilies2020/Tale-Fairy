import test from 'node:test';
import assert from 'node:assert/strict';
import { replayBootstrap } from '../scripts/replay-context.mjs';

test('live replay supplies flat character references instead of object coercion', () => {
    assert.deepEqual(replayBootstrap({ character: 'Example', data: { description: 'A wider journey.', scenario: 'Life over years.', system_prompt: 'Setting mechanics.', secret: 'excluded' } }),
        { description: 'A wider journey.', scenario: 'Life over years.', cardSystemReference: 'Setting mechanics.' });
});
test('replay card bounds match browser bootstrap bounds and reject object fields', () => {
    const result = replayBootstrap({ data: { description: 'a'.repeat(5000), personality: { unsupported: true } } });
    assert.equal(result.description.length, 3500);
    assert.equal(result.personality, undefined);
});
test('fictional acceptance scenes retain their broad RP description', () => {
    assert.deepEqual(replayBootstrap(null, 'An ordinary life over months.'), { scenario: 'An ordinary life over months.' });
});
