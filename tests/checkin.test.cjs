const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
assert.equal(new Set(ids).size, ids.length, 'Unique HTML IDs');

function harness(initial = {}) {
  let now = Date.parse('2026-10-14T04:00:00Z');
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const elements = new Map(ids.map(id => [id, {
    value: '', textContent: '', innerHTML: '', checked: false, disabled: false,
    style: {}, dataset: {}, classList: {toggle() {}, add() {}, remove() {}},
    addEventListener() {}, focus() {}, select() { this.selected = true; }, scrollIntoView() {}
  }]));
  const storage = new Map(Object.entries(initial));
  let failWrites = false, copied = '', queue = Promise.resolve();
  const context = vm.createContext({
    Date: Clock, console, setTimeout: () => 0, clearTimeout() {}, setInterval() {},
    document: {getElementById: id => {
      assert.ok(elements.has(id), 'Referenced element exists: ' + id); return elements.get(id);
    }, querySelectorAll: () => [], addEventListener() {}},
    window: {addEventListener() {}},
    localStorage: {getItem: k => storage.get(k) || null, setItem: (k,v) => {
      if (failWrites) throw new Error('Quota exceeded'); storage.set(k,v);
    }},
    navigator: {locks: {request: (_key, fn) => {
      const next = queue.then(fn); queue = next.catch(() => {}); return next;
    }}, clipboard: {writeText: async value => { copied = value; }}},
    confirm: () => true
  });
  vm.runInContext(script, context);
  return {run: code => vm.runInContext(code, context), elements, storage,
    clock: date => {now = Date.parse(date);}, fail: value => {failWrites = value;}, copied: () => copied};
}

async function main() {
  const h = harness();
  h.run('d.t=[];persist()');
  assert.equal(h.run('d.version'), 12);
  assert.equal(h.run('d.checkins.length'), 0);
  assert.equal(h.run("checkinDay(Date.parse('2026-10-14T15:59:59Z'))"), '2026-10-14');
  assert.equal(h.run("checkinDay(Date.parse('2026-10-14T16:00:00Z'))"), '2026-10-15');
  assert.equal(h.run("shiftCheckinDay('2024-03-01',-1)"), '2024-02-29');
  assert.equal(h.run("validCheckinDay('2026-02-30')"), false);
  h.elements.get('checkinNote').value = '<img src=x onerror=alert(1)>私人备注';
  await h.run('Promise.all([dailyCheckIn(),dailyCheckIn()])');
  assert.equal(h.run('d.checkins.length'), 1);
  assert.equal(h.run('d.p'), 1);
  assert.equal(h.run('d.xp'), 1);
  assert.equal(h.run('d.completed+d.streak+d.k+d.e+d.b+d.h'), 0, 'No task or attribute rewards');
  assert.equal(h.elements.get('checkinButton').disabled, true);
  assert.ok(!h.elements.get('checkinDays').innerHTML.includes('<img'));
  await h.run('dailyCheckIn()');
  assert.equal(h.run('d.p'), 1, 'Duplicate ignored');
  h.run('d=load();render()');
  assert.equal(h.run('d.checkins.length'), 1, 'Reload persists');

  for (let day=15;day<=20;day++) {
    h.clock(`2026-10-${day}T04:00:00Z`);
    await h.run('dailyCheckIn()');
  }
  assert.equal(h.run('d.p'), 10, 'Seven days: 7 base + 3 bonus');
  assert.equal(h.run('checkinStats().streak'), 7);
  assert.equal(h.run('d.checkins[6].reward'), 4);
  await h.run('dailyCheckIn()');
  assert.equal(h.run('d.p'), 10, 'Milestone not repeated');
  for (let day=21;day<=27;day++) {h.clock(`2026-10-${day}T04:00:00Z`);await h.run('dailyCheckIn()');}
  assert.equal(h.run('d.p'), 20, 'Fourteen days has two bonuses');
  h.clock('2026-10-28T04:00:00Z');
  assert.equal(h.run('checkinStats().streak'), 14, 'Yesterday streak retained before today check-in');
  h.clock('2026-10-29T04:00:00Z');
  assert.equal(h.run('checkinStats().streak'), 0, 'Missed day resets streak');
  await h.run('dailyCheckIn()');
  assert.equal(h.run('checkinStats().streak'), 1);
  assert.equal(h.run('checkinStats().best'), 14);
  assert.equal(h.run('checkinStats().total'), 15);
  assert.equal(h.run('d.p'), 21);
  h.clock('2026-11-01T04:00:00Z');
  assert.equal(h.run('checkinStats().month'), 0);
  h.fail(true);
  await h.run('dailyCheckIn()');
  assert.equal(h.run('d.p'), 21, 'Failed storage rolls back reward');
  assert.equal(h.run('d.checkins.length'), 15);
  assert.equal(h.elements.get('checkinButton').disabled, false);
  assert.match(h.elements.get('checkinNotice').textContent,/未能完成/);
  h.fail(false);
  await h.run('dailyCheckIn()');
  assert.equal(h.run('d.p'), 22);

  const old = {version:11,p:25,xp:50,t:[],earnings:[{date:'2026-10-14',amount:100}],expenses:[{date:'2026-10-14',amount:30}],rewards:[{n:'休息',c:10,owned:2}],history:[],logs:[]};
  const migrated=harness({rpg11:JSON.stringify(old)});
  assert.equal(migrated.run('d.p'),25);
  assert.equal(migrated.run('d.rewards[0].owned'),2);
  assert.equal(migrated.run('financialStats().nettoday'),70);
  assert.equal(migrated.run('d.checkins.length'),0,'No retroactive check-ins');
  assert.equal(JSON.parse(migrated.storage.get('rpg11')).version,11,'Old backup untouched');
  const profile=migrated.run('d.localProfileId');
  migrated.run('d=load()');assert.equal(migrated.run('d.localProfileId'),profile);
  migrated.run(`d.history=[{t:Date.now(),n:'秘密任务',a:'b',reward:2}];persist()`);
  migrated.elements.get('checkinNote').value='私人计划';
  await migrated.run('dailyCheckIn()');
  const report=migrated.run('buildSupervisionReport()');
  assert.match(report,/今日完成任务：1/);
  for(const secret of ['秘密任务','私人计划','100','30','70','收入','支出','净收益',profile])assert.ok(!report.includes(secret),'Default excludes '+secret);
  const full=migrated.run('buildSupervisionReport({tasks:true,note:true,finance:true})');
  for(const included of ['秘密任务','私人计划','¥100.00','¥30.00','¥70.00'])assert.ok(full.includes(included));
  migrated.run('generateSupervisionReport()');
  assert.equal(migrated.elements.get('supervisionPreview').value,report);
  migrated.elements.get('shareFinance').checked=true;migrated.run('refreshReportPreview()');
  assert.match(migrated.elements.get('supervisionPreview').value,/收入/);
  migrated.elements.get('shareFinance').checked=false;migrated.run('refreshReportPreview()');
  assert.ok(!migrated.elements.get('supervisionPreview').value.includes('收入'));
  await migrated.run('copySupervisionReport()');assert.equal(migrated.copied(),report);
  migrated.run('navigator.clipboard.writeText=async()=>{throw new Error("denied")}');
  await migrated.run('copySupervisionReport()');assert.equal(migrated.elements.get('supervisionPreview').selected,true);
  assert.match(migrated.elements.get('supervisionNotice').textContent,/手动复制/);
  assert.equal(migrated.run(`normalize({...d,checkins:[...d.checkins,...d.checkins,{date:'2026-02-30',checkedAt:1},null]}).checkins.length`),1,'Import de-duplicates and validates dates');
  const before=migrated.run('d.p');migrated.run('d=normalize(d);persist()');await migrated.run('dailyCheckIn()');assert.equal(migrated.run('d.p'),before,'Import does not reissue award');
  const stale=harness({rpg12:migrated.storage.get('rpg12')});
  stale.run('d.checkins=[];d.p=0');
  await stale.run('dailyCheckIn()');assert.equal(stale.run('d.p'),before,'Stale state re-reads persisted record');
  const fallback=harness();fallback.run('navigator.locks=undefined;d.t=[];persist()');
  await fallback.run('dailyCheckIn()');await fallback.run('dailyCheckIn()');
  assert.equal(fallback.run('d.p'),1,'No-lock single-tab fallback remains idempotent');
  fallback.clock('2026-10-14T16:00:00Z');await fallback.run('dailyCheckIn()');
  assert.equal(fallback.run('d.checkins[1].date'),'2026-10-15','New date without reload');
  const rollback=harness();rollback.run('d.t=[];persist()');
  rollback.elements.get('checkinNote').value='不应遗留的备注';
  await rollback.run('dailyCheckIn()');rollback.run('generateSupervisionReport()');
  rollback.elements.get('shareFinance').checked=true;
  rollback.run('resetAll()');
  assert.equal(rollback.elements.get('checkinNote').value,'','Reset clears old note');
  assert.equal(rollback.elements.get('shareFinance').checked,false);
  assert.equal(rollback.elements.get('supervisionPreview').value,'');
  assert.equal(rollback.run('d.checkins.length'),0);
  assert.equal(rollback.run('d.p'),0);
  console.log('PASS: syntax, unique DOM IDs, UTC+8 rollover, migration, duplicate protection, 7/14-day rewards, missed days, persistence failure, import, report privacy, clipboard fallback.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
