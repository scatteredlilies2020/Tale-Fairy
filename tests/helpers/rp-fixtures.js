// Handwritten analysis fixtures, never a live-model evaluation.
export const originalUnderstanding = (overrides = {}) => ({
    basis: 'original', setting: 'An original world', canonIntent: 'not-applicable', divergence: 'not-applicable',
    anchors: 'The supplied world and freely chosen participation.', departures: 'No external canon to depart from.',
    storyScope: 'Communities and ordinary lives beyond the current scene.',
    experiences: 'Travel, shared activities and relationships.',
    independentSource: 'Townspeople pursue their own festivals and routines.',
    uncertainty: 'Unspecified details remain open.',
    ...overrides,
});
