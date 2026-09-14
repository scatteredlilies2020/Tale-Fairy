// Read the chat's explicit status format, never infer scene facts from prose.
// Wrapped panels can contain multiline character notes and presentation fences.
export function leadingGeneratedStatusSummary(value) {
    const source = String(value || '').replace(/^\uFEFF/u, '');
    const wrapped = source.match(/^\s*<stat(?:\s[^<>]*?)?>([\s\S]*?)<\/stat\s*>/iu);
    const sections = source.split(/\r?\n\s*\r?\n/u);
    const candidate = wrapped ? wrapped[1] : String(sections[0] || '');
    const lines = candidate.split(/\r?\n/u).map(line => line.trim())
        .filter(line => line && !/^```(?:[\p{L}\p{N}_-]+)?$/u.test(line));
    const statusLine = /^(?:time(?:\s*&\s*weather)?|date|day|weather|location|current\s+beat|positions?|inventory(?:\s*&\s*objects)?|objects?|physical\s+state|emotions?|psyche|characters?|active\s+threads?)\s*=\s*\S/iu;
    const fields = lines.filter(line => statusLine.test(line));
    if (fields.length < 3 || !wrapped && fields.length !== lines.length) return { source, status: '', body: source };
    return { source, status: fields.join('\n'), body: wrapped ? source.slice(wrapped[0].length).trimStart() : sections.slice(1).join('\n\n') };
}

export function sceneStatus(value) {
    return leadingGeneratedStatusSummary(value).status.split('\n')
        .filter(line => /^(?:time(?:\s*&\s*weather)?|date|day|weather|location|current\s+beat|positions?)\s*=/iu.test(line)).join('\n');
}
