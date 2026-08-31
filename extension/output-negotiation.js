export const PLANNER_OUTPUT_MODE = Object.freeze({
    JSON_SCHEMA: 'json-schema',
    JSON_OBJECT: 'json-object',
    PROMPT_ONLY: 'prompt-only',
});

function schemaInstruction(schema) {
    return `JSON schema for the response:\n${JSON.stringify(schema.value, null, 2)}`;
}

export function plannerMessages(systemPrompt, prompt, schema, mode) {
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
    ];
    if (mode !== PLANNER_OUTPUT_MODE.JSON_SCHEMA) {
        messages.push({ role: 'user', content: schemaInstruction(schema) });
    }
    return messages;
}

export function plannerPrompt(prompt, schema, mode) {
    return mode === PLANNER_OUTPUT_MODE.JSON_SCHEMA
        ? prompt
        : `${prompt}\n\n${schemaInstruction(schema)}`;
}

export function customOutputPayload(payload, mode) {
    const result = { ...payload };
    if (mode !== PLANNER_OUTPUT_MODE.JSON_OBJECT) return result;

    let included = {};
    try {
        const parsed = JSON.parse(result.custom_include_body || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) included = parsed;
    } catch {
        // Tale Fairy owns this override. A malformed inherited value must not
        // prevent the provider-neutral JSON compatibility attempt.
    }
    included.response_format = { type: 'json_object' };
    result.custom_include_body = JSON.stringify(included);
    return result;
}

export async function negotiateOutputModes({ run, modes, canFallback, signal, cache = null, cacheKey = '', onFallback = null }) {
    const cachedMode = cacheKey ? cache?.get(cacheKey) : '';
    const cachedIndex = modes.indexOf(cachedMode);
    const attempts = cachedIndex > 0 ? modes.slice(cachedIndex) : modes;
    let lastError;
    for (let index = 0; index < attempts.length; index++) {
        const mode = attempts[index];
        try {
            const result = await run(mode);
            if (cacheKey) cache?.set(cacheKey, mode);
            return result;
        } catch (error) {
            signal?.throwIfAborted();
            lastError = error;
            const nextMode = attempts[index + 1];
            if (!nextMode || !canFallback(error)) throw error;
            onFallback?.(error, mode, nextMode);
        }
    }
    throw lastError;
}
