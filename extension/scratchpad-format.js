export function formatHiddenMotives(hiddenMotives = {}, analyzed = true) {
    if (!analyzed || !hiddenMotives.items?.length) return '';
    const itemBlocks = hiddenMotives.items.map((motive, index) => [
        `${index + 1}. ${motive.explanation} [${motive.likelihood}]`,
        `Actor: ${motive.actor} · Relevance: ${motive.currentRelevance} · Disclosure: ${motive.disclosure}`,
        `Mechanism: ${motive.mechanism}`,
        motive.evidence?.length ? `Evidence: ${motive.evidence.join('; ')}` : '',
        motive.counterevidence?.length ? `Counterevidence: ${motive.counterevidence.join('; ')}` : '',
    ].filter(Boolean).join('\n'));
    return [
        `Board status: ${hiddenMotives.status || 'open'}${hiddenMotives.audit ? ` · ${hiddenMotives.audit}` : ''}`,
        itemBlocks.join('\n\n'),
    ].join('\n');
}
