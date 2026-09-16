// Evaluation-only, bounded contract repair. No semantic judge or reroll-until-good.
import { extractJson } from '../extension/analysis.js';
import { plannerValidationRepairInstruction } from '../extension/output-negotiation.js';

export function contractIssues(value, schema, at = '$') {
    const issues = [];
    const issue = text => issues.push(`${at}: ${text}`);
    if (schema.const !== undefined && value !== schema.const) issue(`expected ${JSON.stringify(schema.const)}`);
    if (schema.oneOf) {
        const variants = schema.oneOf.map(s => contractIssues(value, s, at));
        const matches = variants.filter(v => !v.length).length;
        if (matches === 1) return issues;
        if (matches > 1) return [...issues, `${at}: ambiguous exclusive alternative`];
        return [...issues, ...variants.sort((a, b) => a.length - b.length)[0]];
    }
    if (schema.enum && !schema.enum.includes(value)) issue('not an allowed value');
    if (schema.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${at}: expected object`];
        for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) issue(`missing ${key}`);
        for (const [key, child] of Object.entries(value)) {
            if (schema.properties?.[key]) issues.push(...contractIssues(child, schema.properties[key], `${at}.${key}`));
            else if (schema.additionalProperties === false) issue(`unexpected key ${key}`);
        }
    } else if (schema.type === 'array') {
        if (!Array.isArray(value)) return [`${at}: expected array`];
        if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) issue('array length outside bounds');
        if (schema.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) issue('duplicate items');
        value.forEach((v, i) => issues.push(...contractIssues(v, schema.items, `${at}[${i}]`)));
    } else if (schema.type === 'string') {
        if (typeof value !== 'string') return [`${at}: expected string`];
        if (value.length < (schema.minLength ?? 0)) issue('string too short');
        if (value.length > (schema.maxLength ?? Infinity)) issue(`${value.length} characters exceeds maximum ${schema.maxLength}; shorten substantially, aiming below ${Math.floor(schema.maxLength * 0.7)} characters`);
    } else if (schema.type === 'integer') {
        if (!Number.isInteger(value) || value < (schema.minimum ?? -Infinity)) issue('invalid integer');
    }
    return issues;
}

export async function validatedStaging({ conversation, schema, generate, validate }) {
    const attempts = [];
    let request = conversation;
    for (let i = 0; i < 2; i++) {
        const raw = await generate(request, i);
        if (raw === null) return { value: null, attempts };
        try {
            const parsed = extractJson(raw), issues = contractIssues(parsed, schema.value);
            if (issues.length) throw Object.assign(Error('Schema validation failed'), { validationErrors: issues });
            const value = validate(parsed);
            attempts.push({ valid: true, repair: i === 1 });
            return { value, attempts };
        } catch (error) {
            attempts.push({ valid: false, repair: i === 1, errors: error.validationErrors ?? [error.message] });
            request = [...conversation, { role: 'assistant', content: raw }, { role: 'user', content: plannerValidationRepairInstruction(error) }];
        }
    }
    return { value: null, attempts };
}
