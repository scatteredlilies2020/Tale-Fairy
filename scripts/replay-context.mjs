// Match index.js bootstrapContext's bounded, flat reference fields. Do not
// stringify an entire character object into "[object Object]".
export function replayBootstrap(character, scenarioDescription = '') {
    if (scenarioDescription) return { scenario: String(scenarioDescription).slice(0, 3500) };
    const data = character?.data || {};
    const result = {};
    for (const key of ['description', 'personality', 'scenario', 'persona']) {
        if (typeof data[key] === 'string' && data[key]) result[key] = data[key].slice(0, 3500);
    }
    const system = data.system_prompt || data.system;
    if (typeof system === 'string' && system) result.cardSystemReference = system.slice(0, 3500);
    return result;
}
