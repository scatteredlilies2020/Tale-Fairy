const PLACEHOLDER_REPLY = /^(?:\.{3,}|…+|(?:loading|thinking|generating|processing|no response|no output|n\/a)(?:[ .…]+)*)$/iu;
const ARTIFACT_REPLY = /^(?:undefined|null|nan|\[object (?:object|promise)\])$/iu;
const ERROR_REPLY = /^(?:error|generation failed|no response generated|api error)\s*[:.-]?\s*(?:\[[^\]]+\]|\S.*)?$/iu;

function normalizedReply(value) {
    return String(value ?? '')
        .replace(/\s+/gu, ' ')
        .trim()
        .toLocaleLowerCase();
}

function looksLikeJsonArtifact(value) {
    const text = String(value ?? '')
        .trim()
        .replace(/^```(?:json)?\s*/iu, '')
        .replace(/\s*```$/u, '')
        .trim();
    if (!/^[{[]/u.test(text) || !/[}\]]$/u.test(text)) return false;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object';
    } catch {
        return false;
    }
}

/**
 * Detect only output that cannot usefully function as a roleplay reply.
 * Deliberately avoids judging tone, length, silence, or ordinary refusals.
 */
export function classifyAssistantReply(messages = []) {
    const source = Array.isArray(messages) ? messages : [];
    const latestIndex = source.findLastIndex(message => message && !message.is_user && !message.is_system);
    if (latestIndex < 0) return { unusable: false, reason: '' };
    const raw = String(source[latestIndex]?.mes ?? '').trim();
    const normalized = normalizedReply(raw);
    if (!normalized) return { unusable: true, reason: 'empty reply' };
    if (PLACEHOLDER_REPLY.test(raw)) return { unusable: true, reason: 'placeholder reply' };
    if (ARTIFACT_REPLY.test(raw)) return { unusable: true, reason: 'serialization artifact' };
    if (ERROR_REPLY.test(raw)) return { unusable: true, reason: 'provider error reply' };
    if (looksLikeJsonArtifact(raw)) return { unusable: true, reason: 'serialized output artifact' };

    const priorAssistant = source
        .slice(0, latestIndex)
        .findLast(message => message && !message.is_user && !message.is_system);
    const prior = normalizedReply(priorAssistant?.mes);
    if (normalized.length >= 40 && prior && normalized === prior) {
        return { unusable: true, reason: 'exact duplicate reply' };
    }
    return { unusable: false, reason: '' };
}
