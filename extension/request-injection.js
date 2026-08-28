const CONTEXT_PATTERN = /\n?<tale-fairy-context>[\s\S]*?<\/tale-fairy-context>\n?/giu;
const LEGACY_GUIDE_PATTERN = /\n?<living-world-guide>[\s\S]*?<\/living-world-guide>\n?/giu;
const LEGACY_POLICY_PATTERN = /\n?<tale-fairy-narrative-policy>[\s\S]*?<\/tale-fairy-narrative-policy>\n?/giu;
const LEGACY_NOTES_PATTERN = /\n?<tale-fairy-user-notes>[\s\S]*?<\/tale-fairy-user-notes>\n?/giu;
const LEGACY_CANON_PATTERN = /\n?<user-established-canon>[\s\S]*?<\/user-established-canon>\n?/giu;
const TALE_FAIRY_TAG_PATTERN = /<(?:tale-fairy-context|tale-fairy-narrative-policy|tale-fairy-user-notes|living-world-guide|user-established-canon)>/iu;

function contextSegment(payload) {
    const source = String(payload || '');
    return source.match(/<tale-fairy-context>[\s\S]*?<\/tale-fairy-context>/iu)?.[0]
        || source.match(/<living-world-guide>[\s\S]*?<\/living-world-guide>/iu)?.[0]
        || '';
}

function contentStrings(value) {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(contentStrings);
    if (value && typeof value === 'object') return contentStrings(value.text ?? value.content ?? '');
    return [];
}

function chatText(chat) {
    return (chat || []).flatMap(message => contentStrings(message?.content)).join('\n');
}

export function requestContainsMarker(value, marker) {
    const needle = String(marker || '');
    const seen = new Set();
    const visit = item => {
        if (typeof item === 'string') return Boolean(needle && item.includes(needle));
        if (!item || typeof item !== 'object' || seen.has(item)) return false;
        seen.add(item);
        if (Array.isArray(item)) return item.some(visit);
        return ['prompt', 'messages', 'chat', 'content', 'text'].some(key => visit(item[key]));
    };
    return visit(value);
}

function hasExactlyCurrentContext(source, context) {
    if (!context) return false;
    const text = String(source || '');
    const first = text.indexOf(context);
    if (first < 0 || text.indexOf(context, first + context.length) >= 0) return false;
    return !TALE_FAIRY_TAG_PATTERN.test(`${text.slice(0, first)}${text.slice(first + context.length)}`);
}

function removeStaleGuidance(value) {
    if (typeof value === 'string') {
        return value
            .replace(CONTEXT_PATTERN, '\n')
            .replace(LEGACY_GUIDE_PATTERN, '\n')
            .replace(LEGACY_POLICY_PATTERN, '\n')
            .replace(LEGACY_NOTES_PATTERN, '\n')
            .replace(LEGACY_CANON_PATTERN, '\n')
            .trim();
    }
    if (Array.isArray(value)) {
        return value.map(item => {
            if (typeof item === 'string') return removeStaleGuidance(item);
            if (item && typeof item === 'object' && typeof item.text === 'string') return { ...item, text: removeStaleGuidance(item.text) };
            return item;
        });
    }
    return value;
}

export function chatHasCurrentGuidance(chat, payload) {
    const context = contextSegment(payload);
    return hasExactlyCurrentContext(chatText(chat), context);
}

export function textHasCurrentGuidance(prompt, payload) {
    const context = contextSegment(payload);
    return hasExactlyCurrentContext(prompt, context);
}

export function ensureGuidanceInChat(chat, payload, { role = 'user', depth = 2 } = {}) {
    const context = contextSegment(payload);
    if (!Array.isArray(chat) || !context) return false;
    if (hasExactlyCurrentContext(chatText(chat), context)) return false;

    for (const message of chat) {
        if (message && Object.hasOwn(message, 'content')) message.content = removeStaleGuidance(message.content);
    }

    const safeDepth = Math.max(0, Math.min(chat.length, Number(depth) || 0));
    const index = Math.max(0, chat.length - safeDepth);
    chat.splice(index, 0, {
        role: ['system', 'user', 'assistant'].includes(role) ? role : 'user',
        content: context,
        injected: true,
    });
    return true;
}

export function ensureGuidanceInText(prompt, payload) {
    const context = contextSegment(payload);
    const source = String(prompt || '');
    if (!context || hasExactlyCurrentContext(source, context)) return source;

    const withoutStale = removeStaleGuidance(source).trimEnd();
    return `${withoutStale}\n${context}`.trimStart();
}
