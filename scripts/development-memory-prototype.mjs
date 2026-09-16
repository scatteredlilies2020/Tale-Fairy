// Accepted-memory-only routine. Selection is unnecessary for direct repertoire
// delivery, so do not ask for or validate unused scene-selection decisions.
import { maintenanceSchema, maintainDevelopments } from './development-maintenance-prototype.mjs';

export const MEMORY_SYSTEM = `Maintain accepted progress in Tale Fairy's durable private repertoire. This is memory maintenance ONLY: no scene selection, authoring, new designs or future scheduling.
The source and accepted conversation govern factual claims. Stored designs are proposals, not accepted events. Record only new relevant accepted progress, changed circumstances and explicit user choices, with exact supplied message indices. A request does not prove its desired result. NPC speculation is not omniscient fact; absence of mention is not evidence something never happened. Do not invent the user's decisions or treat aliases as separate people.
Retire local records when their episode explicitly closes. Retire a wider subject only when genuinely ended or excluded, not merely unused, distant, or missing from recent replies. Invalidate a proposed conditional change only when contradicted by accepted play, not because it has not happened yet. All IDs refer to existing records.
If accepted progress makes the future design unsuitable, explain the specific mismatch in review_needed. A broad review can then revise private possibilities without rewriting accepted history. You cannot rewrite scope, designs or local records. Append concise new observations, not repeated recaps or advice. Return exactly observations, invalidate, retire and review_needed using the supplied schema. No select field.`;

export function memorySchema(state) {
    const schema = maintenanceSchema(state);
    schema.name = 'development_memory';
    schema.description = 'Accepted memory only; no unused selection output.';
    schema.value.required = schema.value.required.filter(k => k !== 'select');
    delete schema.value.properties.select;
    return schema;
}

export function updateMemory(state, response, indices) {
    if (!response || Object.hasOwn(response, 'select')) throw Error('Selection is not part of memory maintenance');
    return maintainDevelopments(state, { ...response, select: [] }, indices);
}
