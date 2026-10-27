import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileMeetingRaces } from '../src/lib/resulted-sp/active-races.ts';
import { buildResultedSpSchedule, computeDisplayRaceStatus, startResultedSpPoller } from '../src/lib/resulted-sp/poller.ts';
import { syncRaceDayBiasOnMeetingImport } from '../src/lib/meeting-coordination.ts';
import { createEmptyBiasRaceEntry } from '../src/lib/race-day-bias/storage.ts';

import { parseFullFieldResultsFromHtml } from '../src/lib/resulted-sp/parse-full-field.ts';
Object.defineProperty(globalThis, 'window', {value: {
  setInterval: () => 0, clearInterval: () => {}, dispatchEvent: () => true,
}});
Object.defineProperty(globalThis, 'CustomEvent', {value: class extends Event {
  detail: unknown;
  constructor(type:string, options:any) { super(type); this.detail=options?.detail; }
}});
const values = new Map<string,string>();
Object.defineProperty(globalThis, 'localStorage', {value: {
  getItem: (k:string) => values.get(k) ?? null,
  setItem: (k:string,v:string) => values.set(k,v), removeItem:(k:string)=>values.delete(k),
}});
const meetingId = '2026-10-27-hawkesbury';
const csv = readFileSync('meetings/2026-10-27-hawkesbury/hawkesbury_2026-10-27_master.csv','utf8');
const masterIds = [...new Set(csv.split(/\r?\n/).slice(1).filter(Boolean).map(line=>line.split(',')[0]))];
assert.deepEqual(masterIds, Array.from({length:8},(_,i)=>`R${i+1}`));

for (const count of [8,10,12]) {
  const nos = Array.from({length:count},(_,i)=>String(i+1));
  const full = nos.map(no=>({id:`R${no}`, title:`5:30 pm Race ${no}`,runners:[]}));
  const jsonResults = nos.flatMap(no=>[1,2,3,4].map(position =>
    JSON.stringify({raceNumber:no,finishPosition:position,horseName:`Horse ${no}-${position}`,startingPrice:position+2})
  )).join('\n');
  assert.deepEqual(parseFullFieldResultsFromHtml(jsonResults).map(r=>r.raceNo),nos);
  assert.equal(parseFullFieldResultsFromHtml(jsonResults,String(count))[0].runners.length,4);
  const stale = full.slice(0,7);
  const resolved = reconcileMeetingRaces(nos, full, stale);
  assert.equal(resolved.length,count);
  assert.deepEqual(buildResultedSpSchedule(resolved,'2026-10-27').map(r=>r.raceNo),nos);
  const missing = reconcileMeetingRaces(nos,stale);
  const schedule = buildResultedSpSchedule(missing,'2026-10-27');
  assert.equal(schedule.length,count,'missing times must not hide races');
  assert.equal(schedule[count-1].startTime,null);
  const row = createEmptyBiasRaceEntry(String(count));
  row.first={positionCode:'8',sp:'9.5'};
  values.set(`bias:${meetingId}`, JSON.stringify({meetingLabel:'Hawkesbury',races:[row], updatedAt:''}));
  const imported = {meetingId, updatedAt:'', races:{[String(count)]:{status:'imported',importedAt:'2026-10-27T06:00:00Z',runners:[{raceNo:String(count),runnerNo:'1',horse:'Winner',officialSP:'5',finishPosition:1,margin:'',resultStatus:'resulted',source:'racingnsw'}]}}};
  const cached = JSON.stringify(imported);
  values.set(`resulted-sp:${meetingId}`,cached);
  const bias = syncRaceDayBiasOnMeetingImport(meetingId,nos);
  assert.equal(bias.races.length,count);
  const truncated = syncRaceDayBiasOnMeetingImport(meetingId,['1','2']);
  assert.equal(truncated.races.length,count,'partial imports must preserve existing rows');
  assert.deepEqual(truncated.races[count-1].first,row.first);
  assert.equal(values.get(`resulted-sp:${meetingId}`),cached,'reconciliation must preserve imported SP state');
  assert.equal(computeDisplayRaceStatus(imported as any,String(count),schedule,new Date()),'imported');
  // Exercise cached-import replay without network polling and preserve manual SP.
  const handle = startResultedSpPoller({meetingId,manifest:{meetingId,date:'2099-10-27'} as any,races:full});
  handle.stop();
  assert.deepEqual(JSON.parse(values.get(`bias:${meetingId}`)!).races[count-1].first,row.first);
}
console.log('Dynamic 8/10/12-race schedules, missing times, cached results and bias preservation passed.');
