// The caller supplies a verified referent; this function never guesses one from
// a current scene. Keep the original quotation and its source time together.
export function bindHistoricalInstruction(history, { referent, recordedBefore }) {
    if (typeof history.explicit_user_instruction !== 'string' || !history.explicit_user_instruction.trim()
        || typeof referent !== 'string' || !referent.trim() || !Number.isInteger(recordedBefore) || recordedBefore < 0) throw Error('Verified historical instruction binding required');
    return { ...structuredClone(history), explicit_user_instruction: {
        text: history.explicit_user_instruction,
        referent,
        recorded_before_accepted_message: recordedBefore,
        provenance: 'Historical user instruction. Relative phrases retain this original referent; later subjects are not automatically its target.',
    } };
}
