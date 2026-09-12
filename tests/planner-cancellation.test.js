import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
function harness() {
    let finishList;
    const cancelled = [];
    const scope = {
        detachedPlannerEnabled: true, analysisRunId: 2, analysisStopSequence: 3,
        detachedPlannerJobs: () => new Promise(resolve => { finishList = resolve; }),
        plannerServerApi: async path => cancelled.push(path), console, EXTENSION_ID: 'test',
    };
    vm.createContext(scope);
    vm.runInContext(source.match(/async function cancelDetachedPlannerJobs\([^]*?^}/m)[0], scope);
    return { scope, cancelled, finish: () => finishList([
        { id: 'active', status: 'processing' }, { id: 'waiting', status: 'queued' }, { id: 'done', status: 'complete' },
    ]) };
}

for (const changed of ['analysisRunId', 'analysisStopSequence']) test(`late retry cancellation cannot cancel newer work after ${changed} changes`, async () => {
    const h = harness();
    const request = h.scope.cancelDetachedPlannerJobs('story');
    h.scope[changed]++;
    h.finish();
    await request;
    assert.deepEqual(h.cancelled, []);
});

test('current cancellation still stops queued and processing jobs, not completed results', async () => {
    const h = harness();
    const request = h.scope.cancelDetachedPlannerJobs('story');
    h.finish();
    await request;
    assert.deepEqual(h.cancelled, ['/planner-jobs/active', '/planner-jobs/waiting']);
});
