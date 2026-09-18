// Read-only connection snapshot; no SillyTavern HTTP requests or state writes.
import fs from 'node:fs';
import path from 'node:path';
import { buildReasoningRequest, plannerOutputTokenBudget } from '../extension/reasoning-policy.js';
import { completionText } from '../extension/completion-response.js';
import { writerFailureDetails } from './isolated-writer-provider.mjs';

export function isolatedProvider(root, { mode = 'off', temperature } = {}) {
    if (!['off', 'low', 'high'].includes(mode)) throw Error('Isolated evaluation supports off, low or high reasoning only.');
    if (!root) throw Error('TF_ST_ROOT is required for live evaluation.');
    const settings = JSON.parse(fs.readFileSync(path.join(root, 'data/default-user/settings.json')));
    const tf = settings.extension_settings?.['living-world-guide'];
    temperature ??= tf?.analysisTemperature;
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw Error('Invalid evaluation temperature');
    if (tf?.analysisProvider !== 'custom') throw Error('Only the configured custom provider is supported.');
    const endpoint = new URL(`${tf.analysisUrl.replace(/\/$/, '')}/chat/completions`);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
    if (!(endpoint.protocol === 'https:' || endpoint.protocol === 'http:' && loopback) || endpoint.username || endpoint.password || loopback && endpoint.port === '8000') throw Error('Unsafe or ST server endpoint.');
    const secrets = JSON.parse(fs.readFileSync(path.join(root, 'data/default-user/secrets.json')));
    const key = secrets.api_key_custom?.find(s => tf.analysisSecretId ? s.id === tf.analysisSecretId : s.active)?.value;
    if (!key) throw Error('Configured credential unavailable.');
    const reasoning = buildReasoningRequest({ mode, source: tf.analysisProvider, model: tf.analysisModel, url: tf.analysisUrl });
    const extra = JSON.parse(reasoning.payload.custom_include_body || '{}');
    return {
        configuration: { model: tf.analysisModel, temperature, reasoning: mode, reasoningRequest: extra },
        async generate(messages, maxTokens = 6144) {
            const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(240000),
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                body: JSON.stringify({ model: tf.analysisModel, temperature, messages, max_tokens: plannerOutputTokenBudget(maxTokens, mode), stream: false, ...extra }),
            });
            if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}; detail withheld.`), {
                status: response.status, diagnostic: writerFailureDetails(await response.text(), [key]),
            });
            const result = await response.json();
            if (result.error) throw Error('Provider error; detail withheld.');
            return { text: completionText(result), usage: result.usage, finishReason: result.choices?.[0]?.finish_reason,
                reportedModel: typeof result.model === 'string' ? result.model : null };
        },
    };
}
