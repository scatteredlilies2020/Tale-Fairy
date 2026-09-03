export const PLANNER_OUTPUT_MODE = Object.freeze({
    JSON_SCHEMA: 'json-schema',
    JSON_OBJECT: 'json-object',
    PROMPT_ONLY: 'prompt-only',
});

export function plannerOutputModes({ provider = '', model = '', url = '' } = {}) {
    const identity = `${provider} ${model} ${url}`;
    // DeepSeek's OpenAI-compatible routes currently reject response_format,
    // including json_object. Do not make a knowingly invalid capability probe
    // on every page load; prompt instructions plus deterministic validation are
    // the compatible structured-output mechanism for these routes.
    if (String(provider).toLowerCase() === 'custom' && /deepseek/i.test(identity)) {
        return [PLANNER_OUTPUT_MODE.PROMPT_ONLY];
    }
    if (String(provider).toLowerCase() === 'custom') {
        return /^(?:.*\/)?glm[-_.]/i.test(String(model))
            ? [PLANNER_OUTPUT_MODE.JSON_OBJECT, PLANNER_OUTPUT_MODE.PROMPT_ONLY]
            : [PLANNER_OUTPUT_MODE.JSON_SCHEMA, PLANNER_OUTPUT_MODE.JSON_OBJECT, PLANNER_OUTPUT_MODE.PROMPT_ONLY];
    }
    return [PLANNER_OUTPUT_MODE.JSON_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY];
}

function outputErrorText(error) {
    let serialized = '';
    try { serialized = JSON.stringify(error); } catch { /* best effort */ }
    return [error?.message, error?.error?.message, error?.cause?.message, serialized, String(error || '')]
        .filter(Boolean)
        .join('\n');
}

export function isUnsupportedStructuredOutputError(error) {
    const text = outputErrorText(error);
    const namesStructuredControl = /(?:json[_ -]?schema|response[_ -]?format|structured outputs?)/i.test(text);
    const describesRejection = /(?:not supported|unsupported|unavailable|not available|does not support|unknown|unrecognized|invalid (?:parameter|argument|request|schema)|not permitted|extra inputs?|forbidden|disabled)/i.test(text);
    return namesStructuredControl && describesRejection;
}

export async function detachedPlannerFailure(response) {
    const raw = await response.text();
    let detail = '';
    try {
        const payload = raw ? JSON.parse(raw) : {};
        detail = typeof payload?.error === 'string'
            ? payload.error
            : payload?.error?.message || payload?.message || '';
    } catch {
        detail = raw;
    }
    const status = [response.status, response.statusText].filter(Boolean).join(' ');
    const error = new Error(detail || `Planner request failed${status ? ` (${status})` : ''}`);
    error.status = response.status;
    return error;
}

export function stripStructuredOutputControls(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
    for (const key of ['response_format', 'json_schema', 'jsonSchema']) delete payload[key];

    if (typeof payload.custom_include_body === 'string') {
        try {
            const included = JSON.parse(payload.custom_include_body);
            if (included && typeof included === 'object' && !Array.isArray(included)) {
                for (const key of ['response_format', 'json_schema', 'jsonSchema']) delete included[key];
                payload.custom_include_body = JSON.stringify(included);
            }
        } catch {
            // Preserve malformed provider data; this helper only removes fields
            // it can identify without risking unrelated reasoning controls.
        }
    }
    return payload;
}

function schemaInstruction(schema) {
    return `JSON schema for the response:\n${JSON.stringify(schema.value, null, 2)}`;
}

export function plannerValidationRepairInstruction(error) {
    const details = (Array.isArray(error?.validationErrors) ? error.validationErrors : [])
        .slice(0, 16)
        .join('; ')
        || String(error?.message || error || 'The response violated the required contract.');
    return `Your previous response was rejected by deterministic validation. Return a complete replacement JSON object, not a patch or explanation. Correct every listed issue: ${details}`;
}

export function plannerMessages(systemPrompt, prompt, schema, mode, repairInstruction = '') {
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
    ];
    if (mode !== PLANNER_OUTPUT_MODE.JSON_SCHEMA) {
        messages.push({ role: 'user', content: schemaInstruction(schema) });
    }
    if (repairInstruction) messages.push({ role: 'user', content: repairInstruction });
    return messages;
}

export function plannerPrompt(prompt, schema, mode, repairInstruction = '') {
    const base = mode === PLANNER_OUTPUT_MODE.JSON_SCHEMA
        ? prompt
        : `${prompt}\n\n${schemaInstruction(schema)}`;
    return repairInstruction ? `${base}\n\n${repairInstruction}` : base;
}

export function customOutputPayload(payload, mode) {
    const result = { ...payload };
    if (mode === PLANNER_OUTPUT_MODE.PROMPT_ONLY) return stripStructuredOutputControls(result);
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
