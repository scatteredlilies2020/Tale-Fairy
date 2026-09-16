import test from 'node:test';
import assert from 'node:assert/strict';
import { bindHistoricalInstruction } from '../scripts/historical-instruction-prototype.mjs';
test('historical instruction retains its words and original referent without mutating evidence', () => {
    const input = { explicit_user_instruction: 'I am done with this arc.', evidence: ['original'] };
    const bound = bindHistoricalInstruction(input, { referent: 'The delivery dispute, not later independent musical work', recordedBefore: 12 });
    assert.equal(bound.explicit_user_instruction.text, input.explicit_user_instruction);
    assert.equal(bound.explicit_user_instruction.recorded_before_accepted_message, 12);
    bound.evidence.push('changed'); assert.deepEqual(input.evidence, ['original']);
    assert.throws(() => bindHistoricalInstruction(input, { referent: '', recordedBefore: 12 }));
});
