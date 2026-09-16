import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { TRAJECTORY_SCHEMA, TRAJECTORY_SYSTEM, horizonInput, acceptTrajectory } from './trajectory-preparation-prototype.mjs';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { extractJson } from '../extension/analysis.js';
import { estimateTokenCount } from '../extension/token-budget.js';
const live = process.argv.includes('--live');
if (!process.env.TF_EVAL_OUTPUT || !process.env.TF_DRAFTS) throw Error('Explicit output/source required.');
const output = path.resolve(process.env.TF_EVAL_OUTPUT), repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const p of [repo, process.env.TF_ST_ROOT].filter(Boolean).map(p=>path.resolve(p).toLowerCase())) if (output.toLowerCase() === p || output.toLowerCase().startsWith(p+path.sep)) throw Error('Isolated output required.');
if (fs.existsSync(output)) throw Error('Fresh output required.');
const cases = (process.env.TF_CASES || 'frozen-real,touring,closed').split(',');
const format = process.env.TF_SCHEMA_FORMAT || 'shorthand';
if (!['shorthand', 'full'].includes(format)) throw Error('Invalid schema format.');
if (!cases.length || cases.length > 4 || cases.some(c=>!['frozen-real','touring','life','closed'].includes(c))) throw Error('Invalid cases.');
fs.mkdirSync(output, {recursive:true}); fs.mkdirSync(path.join(output,'protocol-snapshot'));
for (const f of ['evaluate-trajectory.mjs','trajectory-preparation-prototype.mjs','horizon-preparation-prototype.mjs','development-preparation-prototype.mjs','isolated-planner-provider.mjs']) fs.copyFileSync(new URL(f,import.meta.url),path.join(output,'protocol-snapshot',f));
const provider = live ? isolatedProvider(process.env.TF_ST_ROOT) : null;
const report = {started:new Date().toISOString(),live,configuration:provider?.configuration,protocol:'One independently generated trajectory per case, with explicit later/middle/beginning schema and concrete private workings. Premise-only preparation; full source saved unchanged for downstream compatibility. First sample only, no output repair; sequential with 30s gap, stop on HTTP429, one retry for 502/503/504.',runs:[]};
const save=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)); save();
for (const name of cases) {
    const full=fs.readFileSync(path.join(process.env.TF_DRAFTS,`${name}-input.json`),'utf8'), prompt=horizonInput(JSON.parse(full));
    const conversation=plannerMessages(TRAJECTORY_SYSTEM,prompt,TRAJECTORY_SCHEMA,PLANNER_OUTPUT_MODE.PROMPT_ONLY);
    if (format === 'full') conversation[2].content = `Return only one JSON object conforming to this JSON Schema. No duplicate keys. String lengths are character limits, not word limits.\n${JSON.stringify(TRAJECTORY_SCHEMA.value)}`;
    const run={name,inputTokens:estimateTokenCount(JSON.stringify(conversation)),attempts:[]}; report.runs.push(run); save();
    fs.writeFileSync(path.join(output,`${name}-input.json`),full); fs.writeFileSync(path.join(output,`${name}-request.json`),JSON.stringify(conversation,null,2));
    try {
        if (run.inputTokens>24000) throw Error('Complete input exceeds budget.');
        if (!provider) continue;
        let result;
        for(let attempt=1;attempt<=2;attempt++) {
            const entry={attempt},start=Date.now();run.attempts.push(entry);save();
            try { result=await provider.generate(conversation,6000);entry.elapsedMs=Date.now()-start;entry.usage=result.usage;entry.finishReason=result.finishReason;break; }
            catch(e){entry.error=e.status?`HTTP ${e.status}`:'Transport failed';entry.elapsedMs=Date.now()-start;save();if(attempt===2||![502,503,504].includes(e.status))throw e;await new Promise(r=>setTimeout(r,30000));}
        }
        fs.writeFileSync(path.join(output,`${name}-output.txt`),result.text);
        if(result.finishReason==='length')throw Error('Incomplete output.');
        const prepared=acceptTrajectory(extractJson(result.text));fs.writeFileSync(path.join(output,`${name}-preparation.json`),JSON.stringify(prepared,null,2));run.valid=true;run.ids=prepared.developments.map(d=>d.id);
    }catch(e){run.error=e.status?`HTTP ${e.status}`:'Validation/transport failure; inspect saved response.';if(e.status===429){save();break;}}
    save();console.log(JSON.stringify(run));if(provider&&cases.at(-1)!==name)await new Promise(r=>setTimeout(r,30000));
}
report.ended=new Date().toISOString();save();
