// Presentation only. Saved long-form outlooks stay intact behind each disclosure.
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
function preview(value, limit = 170) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= limit) return text;
    const head = text.slice(0, limit), boundary = head.lastIndexOf(' ');
    return head.slice(0, boundary > limit / 2 ? boundary : limit).trimEnd() + '…';
}
const noteHtml = ([label, text]) => `<li><span class="tf-future-note-label">${escape(label)}</span> ${escape(text)}</li>`;
function cardHtml(card) {
    const notes = [
        ['Timing', card.timing], ['Favors', card.favors], ['Could change', card.prevents],
        ...(card.pressures || []).map(p => [p.label, p.pressure]),
        ['Transition', card.transition], ['Outlook', card.outlook],
    ].filter(([, text]) => typeof text === 'string' && text.trim());
    const shortPremise = preview(card.premise);
    const brief = notes.slice(0, 3).map(([label, text]) => [label, preview(text, 140)]);
    const hasMore = notes.length > brief.length || shortPremise !== card.premise
        || brief.some(([, text], i) => text !== notes[i][1]);
    return `<article class="tf-story-card tf-status-proposed tf-future-card">
        <header class="tf-card-header"><span class="tf-card-kind">Future Chapter</span><span class="tf-card-badge">${escape(card.category)}</span></header>
        <h6 class="tf-card-title">${escape(card.title)}</h6>
        <p class="tf-card-description">${escape(shortPremise)}</p>
        ${brief.length ? `<ul class="tf-future-notes">${brief.map(noteHtml).join('')}</ul>` : ''}
        ${hasMore ? `<details class="tf-future-details" data-disclosure="future-${escape(card.id)}"><summary>Full notes</summary>
            <p>${escape(card.premise)}</p><ul class="tf-future-notes">${notes.map(noteHtml).join('')}</ul></details>` : ''}
    </article>`;
}

export function futureCardsHtml(outlook, attempt, { stale = false, invalid = false } = {}) {
    const cards = Array.isArray(outlook?.cards) ? outlook.cards : [];
    const status = attempt?.status || (cards.length ? 'saved' : 'not yet planned');
    return `<div class="tf-story-board tf-future-board">
        <div class="tf-board-topline"><span class="tf-card-label">Private possibilities</span><span>${escape(status)}</span></div>
        ${stale ? '<p class="tf-board-warning">Source changed. These saved possibilities await review.</p>' : ''}
        ${attempt?.error ? `<p class="tf-board-warning">Last request: ${escape(attempt.error)}</p>` : ''}
        ${invalid ? '<p class="tf-board-warning">Saved outlook is invalid and withheld. Use Plan future now to replace it.</p>'
            : cards.length ? `<div class="tf-story-grid">${cards.map(cardHtml).join('')}</div>`
                : '<p class="tf-board-empty">No future Chapters saved.</p>'}
    </div>`;
}

const previousMarkup = new WeakMap();
export function renderFutureCards(container, outlook, attempt, options) {
    if (!container) return;
    const html = futureCardsHtml(outlook, attempt, options);
    if (previousMarkup.get(container) === html) return;
    const opened = new Set(Array.from(container.querySelectorAll('details[open][data-disclosure]'), e => e.dataset.disclosure));
    container.innerHTML = html;
    for (const element of container.querySelectorAll('details[data-disclosure]')) element.open = opened.has(element.dataset.disclosure);
    previousMarkup.set(container, html);
}
