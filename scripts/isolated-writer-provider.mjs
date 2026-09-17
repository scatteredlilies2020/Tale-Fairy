// Existing saved DeepSeek connection, used without ST HTTP or state mutation.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { completionText } from '../extension/completion-response.js';

// Keep the classification safe to print. A short redacted diagnostic excerpt
// is saved only in the user's isolated local report, never sent to a model.
export function writerFailureDetails(body, secrets = []) {
    let value;
    try { value = JSON.parse(body); } catch { /* Some gateways return HTML. */ }
    const error = value?.error;
    const message = typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message
        : typeof value?.message === 'string' ? value.message : typeof value?.detail === 'string' ? value.detail
            : typeof value?.msg === 'string' ? value.msg : '';
    const redact = text => secrets.filter(secret => typeof secret === 'string' && secret).reduce((s, secret) => s.split(secret).join('[redacted]'), text)
        .replace(/https?:\/\/[^\s"<>]+/gi, '[redacted-url]')
        .replace(/\bBearer\s+[^\s",}]+/gi, 'Bearer [redacted]')
        .replace(/\b(?:sk-|sess-)[a-z0-9_-]+/gi, '[redacted-key]')
        .replace(/((?:authorization|cookie|api[_-]?key|password|secret|token)\s*[:=]\s*)[^\s,;}]+/gi, '$1[redacted]');
    const safeBody = value ? JSON.stringify(value, (key, entry) => /authorization|cookie|api.?key|password|secret|token/i.test(key)
        ? '[redacted]' : typeof entry === 'string' ? redact(entry) : entry) : redact(body);
    const categories = [
        ['context-limit', /context.{0,40}(?:length|limit|exceed)|too many tokens|maximum.{0,20}tokens/i],
        ['reasoning-format', /reasoning_content|thinking.{0,50}(?:required|invalid|budget)|reasoning.{0,50}(?:required|invalid|missing)/i],
        ['message-format', /messages?.{0,50}(?:invalid|required|must|unsupported)|role.{0,40}(?:invalid|must)|alternat.{0,30}(?:user|assistant)/i],
        ['model-unavailable', /model.{0,60}(?:not found|not exist|not enabled|unavailable|unsupported|invalid)/i],
        ['unsupported-parameter', /unsupported.{0,30}(?:parameter|argument)|(?:parameter|argument).{0,60}(?:unsupported|not supported|invalid)/i],
        ['authentication', /unauthori[sz]ed|authentication|invalid.{0,15}(?:api.?key|token)|credential/i],
        ['rate-limit', /rate.?limit|quota|too many requests/i],
        ['upstream-failure', /upstream|gateway|overloaded|capacity|provider.{0,40}(?:fail|error)/i],
    ];
    const type = ['invalid_request_error', 'authentication_error', 'rate_limit_error', 'server_error'].includes(error?.type) ? error.type : 'other';
    const parameter = ['messages', 'model', 'max_tokens', 'temperature', 'thinking', 'reasoning_effort', 'reasoning_content', 'top_p'].includes(error?.param) ? error.param : null;
    return { category: categories.find(([, pattern]) => pattern.test(message))?.[0] || 'unclassified',
        responseFormat: value ? 'json' : 'non-json', errorType: type, parameter, bodyCharacters: body.length,
        localExcerpt: safeBody.slice(0, 1200) };
}

// Prompt preparation is independent of credentials and the live writer route.
// Isolated substitute tests retain their frozen preset even if the user changes
// the live writer connection. Direct saved-writer requests still validate it.
export async function isolatedWriterPreparation(root, { userName = 'Player', characterName = 'Storyteller' } = {}) {
    const { setConfigFilePath } = await import(pathToFileURL(path.join(root, 'src/util.js')));
    setConfigFilePath(path.join(root, 'config.yaml'));
    const { postProcessPrompt, PROMPT_PROCESSING_TYPE, addAssistantPrefix } = await import(pathToFileURL(path.join(root, 'src/prompt-converters.js')));
    return conversation => addAssistantPrefix(postProcessPrompt(structuredClone(conversation), PROMPT_PROCESSING_TYPE.SEMI_TOOLS,
        { charName: characterName, userName, groupNames: [], startsWithGroupName: () => false }), undefined, 'prefix');
}

export async function isolatedWriterProvider(root, preset, names = {}) {
    const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
    const oai = read(path.join(root, 'data/default-user/settings.json')).oai_settings;
    if (oai.chat_completion_source !== 'deepseek' || oai.deepseek_model !== preset.model || oai.temp_openai !== preset.temperature) throw Error('Writer configuration changed or unsupported');
    const secrets = read(path.join(root, 'data/default-user/secrets.json'));
    const key = oai.reverse_proxy ? oai.proxy_password : secrets.api_key_deepseek?.find(s => s.active)?.value;
    const endpoint = new URL((oai.reverse_proxy || 'https://api.deepseek.com/beta').replace(/\/$/, '') + '/chat/completions');
    if (!(endpoint.protocol === 'https:' || endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) || endpoint.username || endpoint.password || endpoint.port === '8000') throw Error('Unsupported writer endpoint');
    const prepare = await isolatedWriterPreparation(root, names);
    return {
        configuration: { model: preset.model, temperature: preset.temperature, reasoning: preset.reasoning }, prepare,
        async generate(messages, maxTokens = preset.maxOutput) {
            const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(300000),
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key || ''}` },
                body: JSON.stringify({ messages, model: preset.model, temperature: preset.temperature, max_tokens: maxTokens,
                    stream: false, top_p: oai.top_p_openai, frequency_penalty: oai.freq_pen_openai, presence_penalty: oai.pres_pen_openai,
                    thinking: { type: oai.show_thoughts ? 'enabled' : 'disabled' }, ...(oai.show_thoughts ? { reasoning_effort: preset.reasoning } : {}) }),
            });
            if (!response.ok) throw Object.assign(Error('HTTP failure'), { status: response.status,
                diagnostic: writerFailureDetails(await response.text(), [key]) });
            const data = await response.json();
            return { text: completionText(data), usage: data.usage, finishReason: data.choices?.[0]?.finish_reason,
                reportedModel: typeof data.model === 'string' ? data.model : null };
        },
    };
}
