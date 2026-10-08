// Presentation only: opening the board never changes story state or calls a model.
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const kinds = { saga: 'Broad current', arc: 'Arc', thread: 'Thread' };
const statuses = { proposed: 'Proposed', active: 'Active', dormant: 'Dormant', resolved: 'Resolved', retired: 'Retired' };
const field = (label, value) => value ? `<div class="tf-card-detail"><span>${label}</span><p>${escape(value)}</p></div>` : '';
const badge = (label, modifier = '') => `<span class="tf-card-badge ${modifier}">${escape(label)}</span>`;

function orderedNodes(nodes) {
    const result = [], seen = new Set();
    function visit(node) {
        if (seen.has(node.id)) return;
        seen.add(node.id); result.push(node);
        nodes.filter(child => child.parentId === node.id).forEach(visit);
    }
    nodes.filter(node => !node.parentId).forEach(visit);
    nodes.forEach(visit); // Defensive: a damaged saved parent cannot hide its child.
    return result;
}

function card(node, rows, selected, fresh) {
    const status = Object.hasOwn(statuses, node.status) ? node.status : 'proposed';
    const ancestors = [], seen = new Set([node.id]);
    let parentInactive = false;
    for (let parent = rows.get(node.parentId); parent && !seen.has(parent.id); parent = rows.get(parent.parentId)) {
        seen.add(parent.id); ancestors.unshift(parent.title);
        parentInactive ||= !['active', 'proposed'].includes(parent.status);
    }
    const playing = ['active', 'proposed'].includes(status) && !parentInactive;
    const effects = node.effects || [];
    const links = (node.links || []).map(id => rows.get(id)?.title).filter(Boolean);
    return `<article class="tf-story-card tf-status-${status}">
        <header class="tf-card-header"><span class="tf-card-kind">${escape(kinds[node.kind] || 'Thread')}</span>${badge(statuses[status], 'tf-card-status')}${parentInactive ? badge('Parent inactive') : ''}</header>
        ${ancestors.length ? `<p class="tf-card-path">${ancestors.map(escape).join(' <span aria-hidden="true">›</span> ')}</p>` : ''}
        <h6 class="tf-card-title">${escape(node.title)}</h6>
        <p class="tf-card-description">${escape(node.interpretation || node.description)}</p>
        ${effects.length ? `<div class="tf-card-effects"><span class="tf-card-label">${playing ? 'Ongoing effects' : 'Retained effects · inactive'}</span>
            <ul>${effects.map(effect => `<li>${badge(effect.label, 'tf-effect-label')}<p>${escape(effect.pressure)}</p></li>`).join('')}</ul></div>` : ''}
        ${field('Driven by', node.owner)}
        ${field('Can end when', node.endsWhen)}
        ${links.length ? field('Connected to', links.join(' · ')) : ''}
        ${node.stakes || node.expectation ? `<details class="tf-card-legacy" data-disclosure="legacy-${escape(node.id)}"><summary>Earlier preparation</summary>${field('Stakes', node.stakes)}${field('Possibilities', node.expectation)}</details>` : ''}
        <footer class="tf-card-footer">${selected.has(node.id) && playing
            ? badge(fresh ? 'Writer selection' : 'Selection awaiting review', fresh ? 'tf-card-selected' : '')
            : '<span>Retained on the board</span>'}</footer>
    </article>`;
}

export function storyCardsHtml(plan, { fresh = true, omitted = 0, orientationOmitted = false } = {}) {
    const map = plan?.storyStructure;
    if (!map) return '';
    const nodes = orderedNodes(map.nodes || []), rows = new Map(nodes.map(node => [node.id, node]));
    const selected = new Set((map.selection || []).map(entry => entry.id));
    const live = nodes.filter(node => ['active', 'proposed'].includes(node.status));
    const resting = nodes.filter(node => node.status === 'dormant');
    const closed = nodes.filter(node => ['resolved', 'retired'].includes(node.status));
    const grid = list => `<div class="tf-story-grid">${list.map(node => card(node, rows, selected, fresh)).join('')}</div>`;
    const collection = (label, key, list) => list.length ? `<details class="tf-story-collection" data-disclosure="${key}"><summary>${label} <span>${list.length}</span></summary>${grid(list)}</details>` : '';
    return `<div class="tf-story-board">
        <div class="tf-board-topline"><span class="tf-card-label">World &amp; story</span><span>${live.length} open · ${resting.length} dormant · ${closed.length} closed</span></div>
        ${map.foundation?.reminder ? `<article class="tf-world-card"><header class="tf-card-header"><span class="tf-card-kind">World frame</span>${badge('Persistent', 'tf-card-selected')}</header>
            <p class="tf-world-reminder">${escape(map.foundation.reminder)}</p>${field('Current phase', plan.direction)}</article>` : ''}
        <p class="tf-board-note${fresh ? '' : ' tf-board-warning'}">${fresh
            ? 'Author-level view. Selected cards guide the writer; revelation and timing stay with the story.'
            : 'Review needed. This saved board is retained, but its expired or changed guidance is withheld from the writer.'}</p>
        ${omitted || orientationOmitted ? '<p class="tf-board-warning">The writer budget omits some selected material. The exact writer guidance preview shows what fits.</p>' : ''}
        ${live.length ? grid(live) : '<p class="tf-board-empty">Room for new stories. No current cards; the world frame can carry a quiet phase.</p>'}
        ${collection('Dormant', 'dormant', resting)}${collection('Closed stories', 'closed', closed)}
        ${map.foundation?.scratchpad || map.foundation?.changeReason ? `<details class="tf-story-notes" data-disclosure="notes"><summary>Planner notes</summary>${field('Interpretation change', map.foundation.changeReason)}${field('Private scratchpad', map.foundation.scratchpad)}</details>` : ''}
    </div>`;
}

const previousMarkup = new WeakMap();
export function renderStoryCards(container, plan, options) {
    if (!container) return;
    const html = storyCardsHtml(plan, options);
    container.hidden = !html;
    if (previousMarkup.get(container) === html) return;
    const opened = new Set(Array.from(container.querySelectorAll('details[open][data-disclosure]'), element => element.dataset.disclosure));
    // Every variable in this markup is HTML-escaped, including model-authored IDs.
    container.innerHTML = html;
    for (const element of container.querySelectorAll('details[data-disclosure]')) element.open = opened.has(element.dataset.disclosure);
    previousMarkup.set(container, html);
}
