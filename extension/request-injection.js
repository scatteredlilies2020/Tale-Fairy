const GUIDE_PATTERN = /\n?<living-world-guide>[\s\S]*?<\/living-world-guide>\n?/giu;

function guideSegment(payload) {
    return String(payload || '').match(/<living-world-guide>[\s\S]*?<\/living-world-guide>/iu)?.[0] || '';
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

function removeStaleGuidance(value) {
    if (typeof value === 'string') return value.replace(GUIDE_PATTERN, '\n').trim();
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
    const guide = guideSegment(payload);
    return Boolean(guide && chatText(chat).includes(guide));
}

export function textHasCurrentGuidance(prompt, payload) {
    const guide = guideSegment(payload);
    return Boolean(guide && String(prompt || '').includes(guide));
}

export function ensureGuidanceInChat(chat, payload, { role = 'user', depth = 3 } = {}) {
    const guide = guideSegment(payload);
    if (!Array.isArray(chat) || !guide || chatHasCurrentGuidance(chat, payload)) return false;

    for (const message of chat) {
        if (message && Object.hasOwn(message, 'content')) message.content = removeStaleGuidance(message.content);
    }

    const existing = chatText(chat);
    const content = existing.includes('<tale-fairy-narrative-policy>') ? guide : String(payload);
    const safeDepth = Math.max(0, Math.min(chat.length, Number(depth) || 0));
    const index = Math.max(0, chat.length - safeDepth);
    chat.splice(index, 0, {
        role: ['system', 'user', 'assistant'].includes(role) ? role : 'user',
        content,
        injected: true,
    });
    return true;
}

export function ensureGuidanceInText(prompt, payload) {
    const guide = guideSegment(payload);
    const source = String(prompt || '');
    if (!guide || textHasCurrentGuidance(source, payload)) return source;

    const withoutStale = source.replace(GUIDE_PATTERN, '\n').trimEnd();
    const content = withoutStale.includes('<tale-fairy-narrative-policy>') ? guide : String(payload);
    return `${withoutStale}\n${content}`.trimStart();
}
