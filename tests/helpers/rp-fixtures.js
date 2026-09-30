// Handwritten analysis fixtures, never a live-model evaluation.
export const originalUnderstanding = (overrides = {}) => ({
    basis: 'original', setting: 'An original world', canonIntent: 'not-applicable', divergence: 'not-applicable',
    anchors: 'The supplied world and freely chosen participation.', departures: 'No external canon to depart from.',
    experiences: 'Travel, shared activities and relationships.', uncertainty: 'Unspecified details remain open.',
    ...overrides,
});
