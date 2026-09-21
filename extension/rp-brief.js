// Private planning context, not a canon database or writer instruction.
export const RP_BRIEF_SCHEMA = {
    type: 'string', minLength: 1, maxLength: 900,
    description: 'This RP: premise, recurring activities, source continuity and departures, emerging direction. State unknowns; no mood, tone, pacing, prose rules or fixed arc. Under 150 words.',
};
