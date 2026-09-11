import { estimateTokenCount, truncateToTokenBudget } from './token-budget.js?v=0.13.9';

const STOP = new Set('the and for that this with from have was were are but not you your they their she her him his our its observe watch wait look just then now'.split(' '));
const AGENCY = /\b(?:refus\w*|declin\w*|depart\w*|left|leav\w*|return\w*|promis\w*|commit\w*|unwilling|boundar\w*|consent|shift|obligation\w*)\b/iu;

export function evidenceTerms(value) {
    return new Set((String(value || '').toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(term => !STOP.has(term)));
}

export function evidenceRelevance(value, query) {
    const terms = query instanceof Set ? query : evidenceTerms(query);
    const found = evidenceTerms(value);
    const overlap = [...terms].filter(term => found.has(term)).length;
    return overlap * 4 + (overlap && AGENCY.test(value) ? 3 : 0);
}

// Select whole relevant sentences, including facts in the middle of a recap.
// Excerpts remain evidence, never newly synthesized facts or instructions.
export function relevantExcerpt(value, tokenLimit, query = '') {
    const text = String(value || '').trim();
    tokenLimit = Math.max(0, Math.floor(Number(tokenLimit) || 0));
    if (!tokenLimit) return '';
    if (estimateTokenCount(text) <= tokenLimit) return text;
    const terms = evidenceTerms(query);
    const sentences = text.match(/[^.!?\n]+(?:[.!?]+|\n|$)/gu) || [text];
    const frequency = new Map();
    const sentenceTerms = sentences.map(sentence => evidenceTerms(sentence));
    for (const found of sentenceTerms) for (const term of found) frequency.set(term, (frequency.get(term) || 0) + 1);
    const records = sentences.map((text, index) => {
        // Repeated scenery must not outrank a rare actor fact simply because
        // its generic words occur throughout the latest reply too.
        const overlap = [...terms].filter(term => sentenceTerms[index].has(term));
        const score = overlap.reduce((sum, term) => sum + 4 * (1 + Math.log((sentences.length + 1) / ((frequency.get(term) || 0) + 1))), 0);
        return { text: text.trim(), index, score: score + (overlap.length && AGENCY.test(text) ? 8 : 0) };
    });
    const ranked = records.map(item => ({ ...item, score: Math.max(item.score,
        // Keep a neighboring pronoun/qualification with its named subject.
        /^(?:she|he|they|it|but|however|instead)\b/iu.test(item.text) ? (records[item.index - 1]?.score || 0) * 0.9 : 0),
    })).filter(item => item.text).sort((a, b) => b.score - a.score || a.index - b.index);
    const chosen = [];
    let remaining = Math.max(0, tokenLimit - 8);
    for (const item of ranked) {
        const cost = estimateTokenCount(item.text) + 2;
        if (cost <= remaining) { chosen.push(item); remaining -= cost; }
    }
    // An unpunctuated/oversized record may not contain any sentence that fits.
    if (!chosen.length) return truncateToTokenBudget(truncateToTokenBudget(ranked[0]?.text || text, Math.max(0, tokenLimit - 4)) + ' …', tokenLimit);
    return truncateToTokenBudget(chosen.sort((a, b) => a.index - b.index).map(item => item.text).join(' … '), tokenLimit);
}

export function relevantActors(entities, query = '', limit = 5) {
    const terms = evidenceTerms(query);
    return (entities || []).filter(item => item && item.relevance !== 'ambient')
        .map((item, index) => ({ item, index, score: evidenceRelevance(item.name, terms) * 10 + evidenceRelevance(Object.values(item).join(' '), terms) }))
        .sort((a, b) => b.score - a.score || b.index - a.index).slice(0, limit).map(({ item }) => item);
}
