import { leadingGeneratedStatusSummary } from './transcript-status.js';

// Callers may advance reviewedCount only after verifying the saved source
// prefix. Budget pressure can remove old assistant prose, never an unreviewed
// player contribution. Required messages remain whole or preparation fails.
export function campaignReviewWindow(messages, count, reviewedCount = 0) {
    if (!Number.isSafeInteger(count) || count < 1
        || !Number.isSafeInteger(reviewedCount) || reviewedCount < 0 || reviewedCount > messages.length
        || messages.some((message, index) => message.index !== index)) {
        throw Error('Campaign review needs a complete indexed prefix and valid window bounds');
    }
    return messages.filter(m => m.index < 2 || m.index >= messages.length - count
        || (m.role === 'user' && m.index >= reviewedCount));
}

// Lossless speaker-label factoring, not a story summary. Only factor a role
// when every supplied message for it explicitly names the same speaker. Mixed
// group speakers and unnamed messages retain their individual attribution.
export function compactCampaignSpeakers(messages) {
    const defaults = {};
    for (const role of ['user', 'assistant']) {
        const rows = messages.filter(message => message.role === role);
        const name = rows[0]?.name;
        if (rows.length >= 3 && typeof name === 'string' && name
            && rows.every(message => message.name === name)) defaults[role] = name;
    }
    return { messages: messages.map(message => {
        if (!Object.hasOwn(defaults, message.role)) return { ...message };
        const { name, ...rest } = message;
        return rest;
    }), defaults };
}

// Deterministic evidence projection, not a generated summary. Keep text,
// status panels, table structure and semantic markup; discard presentation
// attributes on a small allowlist. Unknown/custom tags remain verbatim.
export function campaignEvidenceText(content) {
    return String(content).replace(/<(\/?)(div|span|table|thead|tbody|tfoot|tr|td|th|p|br|b|strong|i|em|s|del|ins|u|ul|ol|li|h[1-6])\b(?:"[^"]*"|'[^']*'|[^'">])*?>/gi,
        tag => tag.replace(/\s+([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g,
            (attribute, name) => /^(?:style|class)$/i.test(name) ? '' : attribute));
}

export function campaignEvidenceMessages(messages, { narrative = false } = {}) {
    const latestAssistant = messages.findLast(m => m.role === 'assistant')?.index;
    return messages.map(message => {
        // User-authored markup may itself be an instruction or a literal clue.
        if (message.role !== 'assistant') return { ...message };
        const parsed = narrative && message.role === 'assistant' && message.index !== latestAssistant
            ? leadingGeneratedStatusSummary(message.content) : null;
        return { ...message, content: campaignEvidenceText(parsed?.status ? parsed.body : message.content),
            ...(parsed?.status ? { omitted: 'Leading generated status panel; narrative and embedded story text retained.' } : {}) };
    });
}
