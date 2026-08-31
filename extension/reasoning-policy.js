export const REASONING_MODES = Object.freeze(['auto', 'off', 'minimum', 'low', 'medium', 'high', 'max']);

export function normalizeReasoningMode(value) {
    const mode = String(value || '').toLowerCase();
    if (mode === 'min') return 'minimum';
    if (mode === 'default') return 'default';
    return REASONING_MODES.includes(mode) ? mode : 'auto';
}

export function profileReasoningEffort(profile, presetNames, presets) {
    if (profile?.reasoning_effort) return String(profile.reasoning_effort);
    const index = profile?.preset ? presetNames?.[profile.preset] : undefined;
    return index === undefined ? '' : String(presets?.[index]?.reasoning_effort || '');
}

export function resolveReasoningMode(configuredMode, profile, presetNames, presets, activeEffort = '') {
    const configured = normalizeReasoningMode(configuredMode);
    if (configured !== 'auto') return configured;
    const inherited = String(profileReasoningEffort(profile, presetNames, presets) || activeEffort || 'auto').toLowerCase();
    if (inherited === 'min') return 'minimum';
    if (['off', 'none'].includes(inherited)) return 'off';
    if (['low', 'medium', 'high', 'max'].includes(inherited)) return inherited;
    return 'default';
}

function minimumReasoningEffort(model = '') {
    return /(?:^|[/:\s])gpt-5\.6(?:$|[.:-])/i.test(String(model)) ? 'low' : 'min';
}

function identifyGemini({ source = '', model = '', url = '', profileName = '' } = {}) {
    const provider = String(source).toLowerCase();
    const address = String(url).toLowerCase();
    const identity = `${model} ${profileName}`.toLowerCase();
    const detected = /gemini/.test(identity)
        || /(?:^|[-_ ])(?:google|makersuite|vertexai|vertex-ai)(?:$|[-_ ])/.test(provider)
        || address.includes('generativelanguage.googleapis.com');
    if (!detected) return null;
    const version = identity.match(/gemini[^\d]*(\d+)(?:[._-](\d+))?/);
    const major = Number(version?.[1]);
    const minor = Number(version?.[2] || 0);
    return {
        knownThinkingModel: major > 2 || (major === 2 && minor >= 5),
        canDisableThinking: major === 2 && minor === 5 && /flash/.test(identity) && !/pro/.test(identity),
        supportsMinimalThinking: major >= 3 && /flash/.test(identity) && !/pro/.test(identity),
    };
}

function customAdapter({ model = '', url = '', profileName = '' } = {}) {
    const address = String(url).toLowerCase();
    const identity = `${profileName} ${model}`.toLowerCase();
    if (address.includes('openrouter.ai') || identity.includes('openrouter')) return 'openrouter';
    if (address.includes('ollama') || address.includes(':11434') || identity.includes('ollama')) return 'ollama';
    if (address.includes('dashscope') || address.includes('aliyuncs') || identity.includes('qwen')) return 'qwen';
    if (address.includes('vllm') || identity.includes('vllm')) return 'vllm';
    if (address.includes('deepseek.com') || identity.includes('deepseek')) return 'deepseek';
    return 'openai-compatible';
}

function customBody(adapter, mode, model, effort = '') {
    if (mode === 'default') return {};
    const off = mode === 'off';
    switch (adapter) {
        case 'deepseek': return {
            thinking: { type: off ? 'disabled' : 'enabled' },
            // SillyTavern's custom provider forwards custom_include_body
            // verbatim. Keep the on/off switch, but also send the selected
            // effort instead of silently reducing every enabled mode to the
            // provider default. DeepSeek-compatible proxies generally expose
            // minimum effort as "low" rather than "min".
            reasoning_effort: mode === 'minimum' ? 'low' : (effort || (off ? 'none' : 'low')),
        };
        case 'openrouter': return { reasoning: { effort: effort || (off ? 'none' : 'minimal'), exclude: true } };
        case 'ollama': return { think: off ? false : (String(model).toLowerCase().includes('gpt-oss') ? 'low' : true) };
        case 'qwen': return { enable_thinking: !off };
        case 'vllm': return off
            ? { reasoning_effort: 'none', chat_template_kwargs: { enable_thinking: false } }
            : { reasoning_effort: 'low' };
        default: return { reasoning_effort: effort || (off ? 'none' : 'minimal') };
    }
}

export function buildReasoningRequest({ mode, source = '', model = '', url = '', profileName = '' } = {}) {
    mode = normalizeReasoningMode(mode);
    const gemini = identifyGemini({ source, model, url, profileName });
    const nativeOpenRouter = String(source).toLowerCase() === 'openrouter';
    if (mode === 'default' || mode === 'auto') {
        return nativeOpenRouter
            ? { adapter: 'openrouter-provider-default', payload: { include_reasoning: true }, controlled: false }
            : { adapter: gemini ? 'gemini-provider-default' : (source || 'provider-default'), payload: {}, controlled: false };
    }
    if (gemini && !gemini.knownThinkingModel) {
        return { adapter: 'gemini-provider-default', payload: {}, controlled: false };
    }
    const nativeGoogle = /^(?:google|makersuite|vertexai|vertex-ai)$/i.test(String(source));
    const minimalGemini = nativeGoogle ? 'min' : 'minimal';
    const requested = mode === 'minimum' ? minimumReasoningEffort(model) : mode;
    const effort = gemini
        ? (mode === 'off' && gemini.canDisableThinking ? 'none'
            : mode === 'off' || mode === 'minimum' ? (gemini.supportsMinimalThinking ? minimalGemini : 'low')
                : requested)
        : (mode === 'off' ? 'none' : requested);
    const normalized = { include_reasoning: mode !== 'off', reasoning_effort: effort };
    if (source !== 'custom') {
        return { adapter: gemini ? 'gemini' : (source || 'sillytavern-active'), payload: normalized, controlled: true };
    }
    const adapter = customAdapter({ model, url, profileName });
    return {
        adapter: gemini ? `gemini-${adapter}` : adapter,
        payload: { ...normalized, custom_include_body: JSON.stringify(customBody(adapter, mode, model, effort)) },
        controlled: true,
    };
}

export function isMandatoryReasoningError(error) {
    const message = String(error?.cause?.message || error?.message || error).toLowerCase();
    return /(?:thinking|reasoning)[^\n]*(?:mandatory|required|requires?|must be enabled|cannot be disabled|can not be disabled)|(?:mandatory|required|requires?)[^\n]*(?:thinking|reasoning)/i.test(message);
}

export function isReasoningControlError(error) {
    if (isMandatoryReasoningError(error)) return true;
    const message = String(error?.cause?.message || error?.message || error).toLowerCase();
    const rejection = '(?:unknown|unsupported|invalid|restricted|not permitted|not allowed|cannot|can not|must be|only support)';
    const control = '(?:thinking|reasoning|enable_thinking|reasoning_effort|chat_template_kwargs|\\bthink\\b)';
    return new RegExp(`${rejection}[^\\n]*${control}|${control}[^\\n]*${rejection}`).test(message);
}

export function reasoningFallbackPayload(error, payload = {}) {
    if (!isMandatoryReasoningError(error)) return {};
    const fallback = { ...payload, include_reasoning: true };
    if (!fallback.reasoning_effort || ['none', 'off', 'disabled'].includes(String(fallback.reasoning_effort).toLowerCase())) fallback.reasoning_effort = 'low';
    if (fallback.custom_include_body) {
        try {
            const body = JSON.parse(fallback.custom_include_body);
            if (body.reasoning && typeof body.reasoning === 'object') body.reasoning = { ...body.reasoning, effort: body.reasoning.effort === 'none' ? 'low' : (body.reasoning.effort || 'low'), exclude: false };
            if (body.thinking?.type === 'disabled') body.thinking.type = 'enabled';
            if ('enable_thinking' in body) body.enable_thinking = true;
            if ('think' in body && body.think === false) body.think = true;
            fallback.custom_include_body = JSON.stringify(body);
        } catch { delete fallback.custom_include_body; }
    }
    return fallback;
}
