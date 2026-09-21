// Normalize representation only. Never invent required content, approximate
// an evidence reference, truncate prose, or choose between conflicting records.
export function normalizePlannerResponse(value, schema) {
    const ignoredFields = [], adjustments = [];
    const visit = (item, rule, path) => {
        if (rule.type === 'object' && item && typeof item === 'object' && !Array.isArray(item)) {
            for (const key of Object.keys(item)) {
                if (!Object.hasOwn(rule.properties, key)) ignoredFields.push(`${path}.${key}`);
            }
            return Object.fromEntries(Object.entries(rule.properties).flatMap(([key, child]) => {
                if (!Object.hasOwn(item, key)) return [];
                const at = `${path}.${key}`;
                if (!rule.required?.includes(key) && (item[key] === null
                    || child.type === 'string' && typeof item[key] === 'string' && !item[key].trim())) {
                    adjustments.push(at);
                    return [];
                }
                return [[key, visit(item[key], child, at)]];
            }));
        }
        if (rule.type === 'array' && Array.isArray(item)) {
            const seen = new Set();
            return item.map((entry, index) => visit(entry, rule.items, `${path}[${index}]`)).filter((entry, index) => {
                const key = JSON.stringify(entry);
                if (seen.has(key)) { adjustments.push(`${path}[${index}]`); return false; }
                seen.add(key);
                return true;
            });
        }
        if (typeof item === 'string' && rule.enum) {
            const match = rule.enum.find(option => typeof option === 'string' && option.toLowerCase() === item.trim().toLowerCase());
            if (match !== undefined && match !== item) { adjustments.push(path); return match; }
        }
        if (rule.type === 'integer' && typeof item === 'string' && /^\d+$/.test(item.trim()) && Number.isSafeInteger(Number(item))) {
            adjustments.push(path);
            return Number(item);
        }
        return item;
    };
    return { value: visit(value, schema, '$'), ignoredFields, adjustments };
}
