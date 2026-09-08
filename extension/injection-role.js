export const INJECTION_ROLES = Object.freeze(['user', 'system', 'assistant']);
export const DEFAULT_INJECTION_ROLE = 'user';

export function normalizeInjectionRole(value) {
    return INJECTION_ROLES.includes(value) ? value : DEFAULT_INJECTION_ROLE;
}
