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

export function extractTaleFairyContext(value) {
    const seen = new Set();
    const visit = item => {
        if (typeof item === 'string') return contextSegment(item);
        if (!item || typeof item !== 'object' || seen.has(item)) return '';
        seen.add(item);
        if (Array.isArray(item)) {
            for (const entry of item) {
                const context = visit(entry);
                if (context) return context;
            }
            return '';
        }
        for (const key of ['prompt', 'messages', 'chat', 'content', 'text']) {
            const context = visit(item[key]);
            if (context) return context;
        }
        return '';
    };
    return visit(value);
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

function contentHasTaleFairyGuidance(value) {
    return TALE_FAIRY_TAG_PATTERN.test(contentStrings(value).join('\n'));
}

function contentIsEmpty(value) {
    if (typeof value === 'string') return !value.trim();
    if (Array.isArray(value)) return value.every(contentIsEmpty);
    if (value && typeof value === 'object') {
        if (Object.hasOwn(value, 'text')) return contentIsEmpty(value.text);
        if (Object.hasOwn(value, 'content')) return contentIsEmpty(value.content);
        return false;
    }
    return value == null;
}

function prependContext(value, context) {
    if (typeof value === 'string') return `${context}\n${value}`;
    if (Array.isArray(value)) return [{ type: 'text', text: context }, ...value];
    return `${context}\n${contentStrings(value).join('\n')}`.trim();
}

export function chatHasCurrentGuidance(chat, payload) {
    const context = contextSegment(payload);
    return hasExactlyCurrentContext(chatText(chat), context);
}

export function textHasCurrentGuidance(prompt, payload) {
    const context = contextSegment(payload);
    return hasExactlyCurrentContext(prompt, context);
}

export function ensureGuidanceInChat(chat, payload, { role = 'user', depth = 1, inlineLatestUser = false } = {}) {
    const context = contextSegment(payload);
    if (!Array.isArray(chat)) return false;
    if (context && !inlineLatestUser && hasExactlyCurrentContext(chatText(chat), context)) return false;
    if (context && inlineLatestUser && hasExactlyCurrentContext(chatText(chat), context)) {
        const alreadyEmbedded = chat.some(message => message?.role === 'user'
            && contentStrings(message.content).join('\n').includes(context)
            && contentStrings(removeStaleGuidance(message.content)).join('').trim());
        if (alreadyEmbedded) return false;
    }

    let changed = false;
    for (let index = chat.length - 1; index >= 0; index--) {
        const message = chat[index];
        if (!message || !Object.hasOwn(message, 'content')) continue;
        const hadGuidance = contentHasTaleFairyGuidance(message.content);
        if (!hadGuidance) continue;
        message.content = removeStaleGuidance(message.content);
        if (contentIsEmpty(message.content)) chat.splice(index, 1);
        changed = true;
    }

    if (!context) return changed;

    if (inlineLatestUser) {
        let latestUser = null;
        for (let index = chat.length - 1; index >= 0; index--) {
            if (chat[index]?.role === 'user') {
                latestUser = chat[index];
                break;
            }
        }
        if (latestUser) {
            latestUser.content = prependContext(latestUser.content, context);
            return true;
        }
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
    if (!context) return contentHasTaleFairyGuidance(source) ? removeStaleGuidance(source) : source;
    if (hasExactlyCurrentContext(source, context) && source.trimStart().startsWith(context)) return source;

    const withoutStale = removeStaleGuidance(source).trimStart();
    return `${context}\n${withoutStale}`.trimEnd();
}
