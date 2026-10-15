import { createGrowth } from './growth.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const DAY = 86400000;
export const ACTIONS = Object.freeze([
  { id: 'focus', title: '专注 25 分钟', detail: '放下干扰，完成一段专注行动。', points: 2 },
  { id: 'learn', title: '学习 20 分钟', detail: '阅读、学习或练习一项技能。', points: 2 },
  { id: 'move', title: '活动 15 分钟', detail: '散步、拉伸或适合自己的轻运动。', points: 2 }
]);
export function dayKey(now) { return new Date(now + 8 * 3600000).toISOString().slice(0, 10); }
export function shiftDay(day, offset) { return new Date(Date.parse(day + 'T00:00:00Z') + offset * DAY).toISOString().slice(0, 10); }
export function weekStart(day) {
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
  return shiftDay(day, -(weekday + 6) % 7);
}
export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function requireThat(condition, status, code, message) { if (!condition) throw new AppError(status, code, message); }
function text(value, min, max, label) {
  requireThat(typeof value === 'string', 400, 'INVALID_INPUT', `${label}格式不正确`);
  const result = value.trim();
  requireThat(result.length >= min && result.length <= max && !/[\u0000-\u001f\u007f]/.test(result), 400, 'INVALID_INPUT', `${label}需为 ${min}～${max} 个字符`);
  return result;
}
const digest = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const passwordOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, passwordOptions);
  return `${salt}:${key.toString('hex')}`;
}
async function passwordMatches(password, hash) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, expected] = hash.split(':');
  const actual = await scrypt(password, salt, 64, passwordOptions);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
function validatePassword(password) {
  requireThat(typeof password === 'string' && password.length >= 12 && password.length <= 128, 400, 'WEAK_PASSWORD', '密码需为 12～128 个字符，请勿与其他网站共用');
  return password;
}

export function createService({ filename = ':memory:', clock = Date.now } = {}) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL,
      password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, consent_version TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS groups(
      id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS members(
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ranking_enabled INTEGER NOT NULL DEFAULT 1, joined_at INTEGER NOT NULL,
      PRIMARY KEY(group_id,user_id));
    CREATE TABLE IF NOT EXISTS invites(
      token_hash TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, used_at INTEGER);
    CREATE TABLE IF NOT EXISTS events(
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('checkin','action')), subject TEXT NOT NULL,
      day TEXT NOT NULL, points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 2), created_at INTEGER NOT NULL,
      PRIMARY KEY(user_id,kind,subject,day));
    CREATE INDEX IF NOT EXISTS events_day ON events(day,user_id);
    PRAGMA user_version=1;
  `);
  const growth = createGrowth({db,clock,dayKey,AppError});
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function publicUser(user) { return { id: user.id, username: user.username, nickname: user.nickname }; }
  function membership(userId, groupId) {
    const member = one('SELECT m.*,g.name,g.owner_id FROM members m JOIN groups g ON g.id=m.group_id WHERE m.group_id=? AND m.user_id=?', groupId, userId);
    requireThat(member, 404, 'GROUP_UNAVAILABLE', '小组不存在或你已没有访问权限'); return member;
  }
  function owner(userId, groupId) {
    const member = membership(userId, groupId);
    requireThat(member.owner_id === userId, 403, 'OWNER_ONLY', '只有组长可以执行此操作'); return member;
  }
  function groupLimit(userId) { requireThat(one('SELECT COUNT(*) AS n FROM members WHERE user_id=?', userId).n < 5, 409, 'GROUP_LIMIT', '开发版最多加入 5 个小组'); }
  function issueSession(user) {
    const value = token(), expiresAt = clock() + 12 * 3600000;
    run('DELETE FROM sessions WHERE expires_at<=?', clock());
    // Bound account session count; no raw token or password is stored.
    const old = all('SELECT token_hash FROM sessions WHERE user_id=? ORDER BY expires_at DESC', user.id);
    old.slice(4).forEach(x => run('DELETE FROM sessions WHERE token_hash=?', x.token_hash));
    run('INSERT INTO sessions VALUES(?,?,?)', digest(value), user.id, expiresAt);
    return { token: value, expiresAt, user: publicUser(user) };
  }
  async function register(body) {
    requireThat(body.accepted === true, 400, 'CONSENT_REQUIRED', '请先阅读并同意开发验证说明');
    const username = text(body.username, 3, 24, '用户名').toLowerCase();
    requireThat(/^[a-z0-9_]+$/.test(username), 400, 'INVALID_USERNAME', '用户名仅支持英文、数字和下划线');
    const nickname = text(body.nickname, 1, 20, '昵称');
    const hash = await hashPassword(validatePassword(body.password));
    requireThat(!one('SELECT id FROM users WHERE username=?', username), 409, 'USERNAME_TAKEN', '该用户名不可用');
    const user = { id: randomUUID(), username, nickname };
    run('INSERT INTO users VALUES(?,?,?,?,?,?)', user.id, username, nickname, hash, clock(), 'dev-v1');
    return issueSession(user);
  }
  // Constant-cost unknown-user path avoids a fast username-existence signal.
  const dummyHash = '0'.repeat(32) + ':' + '0'.repeat(128);
  async function login(body) {
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const user = one('SELECT * FROM users WHERE username=?', username);
    const valid = await passwordMatches(body.password, user?.password_hash || dummyHash);
    requireThat(user && valid, 401, 'LOGIN_FAILED', '用户名或密码不正确'); return issueSession(user);
  }
  function authenticate(value) {
    requireThat(typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value), 401, 'LOGIN_REQUIRED', '请重新登录');
    const user = one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?', digest(value), clock());
    requireThat(user, 401, 'SESSION_EXPIRED', '登录已过期，请重新登录'); return publicUser(user);
  }
  function groups(userId) {
    return all(`SELECT g.id,g.name,g.owner_id AS ownerId,m.ranking_enabled AS rankingEnabled,
      (SELECT COUNT(*) FROM members x WHERE x.group_id=g.id) AS memberCount
      FROM members m JOIN groups g ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.created_at,g.id`, userId);
  }
  function summary(userId) {
    const today = dayKey(clock()), start = weekStart(today);
    const events = all('SELECT day,kind,subject,points FROM events WHERE user_id=? AND day<=? ORDER BY day', userId, today);
    const todayEvents = events.filter(x => x.day === today);
    const days = new Set(events.filter(x => x.kind === 'checkin').map(x => x.day));
    let cursor = days.has(today) ? today : shiftDay(today, -1), streak = 0;
    while (days.has(cursor)) { streak++; cursor = shiftDay(cursor, -1); }
    let best=0,runLength=0,last='';for(const day of [...days].sort()){runLength=last&&shiftDay(last,1)===day?runLength+1:1;best=Math.max(best,runLength);last=day;}
    return { checkinBest:best,checkinDays:[...days].sort().slice(-31),today, weekStart: start, timezone: 'Asia/Shanghai', checkedIn: days.has(today), streak,
      todayPoints: todayEvents.reduce((sum,x) => sum+x.points,0),
      checkinTotal:days.size,checkinMonth:[...days].filter(x=>x.startsWith(today.slice(0,7))).length,
      weekPoints: events.filter(x => x.day >= start).reduce((sum,x) => sum+x.points,0),
      completed: todayEvents.filter(x => x.kind === 'action').map(x => x.subject), actions: ACTIONS, groups: groups(userId) };
  }
  function record(userId, kind, subject) {
    if (kind === 'action') requireThat(ACTIONS.some(x => x.id === subject), 400, 'UNKNOWN_ACTION', '请选择小组统一行动');
    const now = clock(), today = dayKey(now), points = kind === 'checkin' ? 1 : 2;
    return transaction(() => {
      const result = run('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?)', userId, kind, subject, today, points, now);
      if(result.changes===1)growth.recordStandard(userId,kind,subject,today);
      return { awarded: result.changes === 1, points: result.changes ? points : 0, summary: summary(userId) };
    });
  }
  function createGroup(userId, body) {
    requireThat(body.accepted === true,400,'CONSENT_REQUIRED','请确认仅向小组分享昵称和行动统计');
    const name = text(body.name, 2, 24, '小组名称');
    return transaction(() => {
      groupLimit(userId); const id = randomUUID(), now = clock();
      run('INSERT INTO groups VALUES(?,?,?,?)', id, name, userId, now);
      run('INSERT INTO members VALUES(?,?,1,?)', id, userId, now);
      return { id, name };
    });
  }
  function newInvite(userId, groupId) {
    owner(userId, groupId);
    return transaction(() => {
      run('DELETE FROM invites WHERE group_id=?', groupId);
      const code = token(), expiresAt = clock() + DAY;
      run('INSERT INTO invites VALUES(?,?,?,NULL)', digest(code), groupId, expiresAt);
      return { code, expiresAt, uses: 1 };
    });
  }
  function validInvite(code) {
    requireThat(typeof code === 'string' && /^[A-Za-z0-9_-]{43}$/.test(code), 404, 'INVITE_UNAVAILABLE', '邀请码无效、已使用或已过期');
    const invite = one('SELECT i.*,g.name FROM invites i JOIN groups g ON i.group_id=g.id WHERE i.token_hash=? AND i.used_at IS NULL AND i.expires_at>?', digest(code), clock());
    requireThat(invite,404,'INVITE_UNAVAILABLE','邀请码无效、已使用或已过期');return invite;
  }
  function previewInvite(code) { const invite=validInvite(code);return { name:invite.name,expiresAt:invite.expires_at }; }
  function join(userId, body) {
    requireThat(body.accepted === true,400,'CONSENT_REQUIRED','请确认加入及分享范围');
    return transaction(() => {
      const invite=validInvite(body.code);
      requireThat(!one('SELECT 1 FROM members WHERE group_id=? AND user_id=?',invite.group_id,userId),409,'ALREADY_JOINED','你已经是小组成员');
      groupLimit(userId);
      requireThat(one('SELECT COUNT(*) AS n FROM members WHERE group_id=?',invite.group_id).n<30,409,'GROUP_FULL','开发版每组最多 30 人');
      run('INSERT INTO members VALUES(?,?,1,?)',invite.group_id,userId,clock());
      run('UPDATE invites SET used_at=? WHERE token_hash=?',clock(),invite.token_hash);
      return {id:invite.group_id,name:invite.name};
    });
  }
  function board(userId,groupId) {
    membership(userId,groupId);const today=dayKey(clock()),start=weekStart(today),previousStart=shiftDay(start,-7),previousEnd=shiftDay(today,-7);
    const members=all('SELECT m.user_id AS userId,u.nickname FROM members m JOIN users u ON m.user_id=u.id WHERE group_id=? AND ranking_enabled=1',groupId);
    const rows=members.map(member=>{
      const events=all('SELECT day,kind,points FROM events WHERE user_id=? AND day>=? AND day<=?',member.userId,previousStart,today);
      const points=events.filter(x=>x.day>=start).reduce((s,x)=>s+x.points,0);
      const previous=events.filter(x=>x.day<=previousEnd&&x.day<start).reduce((s,x)=>s+x.points,0);
      return {...member,points,improvement:points-previous,checkinDays:events.filter(x=>x.kind==='checkin'&&x.day>=start).length,
        checkedToday:events.some(x=>x.kind==='checkin'&&x.day===today),actionsToday:events.filter(x=>x.kind==='action'&&x.day===today).length};
    }).sort((a,b)=>b.points-a.points||a.nickname.localeCompare(b.nickname,'zh-CN')||a.userId.localeCompare(b.userId));
    let previous=-1,rank=0;rows.forEach((row,i)=>{if(row.points!==previous)rank=i+1;row.rank=rank;previous=row.points;});
    return {today,weekStart:start,previousPeriod:{start:previousStart,end:previousEnd},rows,
      note:'组内可见；同分同名次。进步值对比上周同期。行动是本人确认，服务端只能校验次数与计分，不能证明实际完成。'};
  }
  function setRanking(userId,groupId,enabled) {
    membership(userId,groupId);requireThat(typeof enabled==='boolean',400,'INVALID_INPUT','参榜设置格式不正确');
    run('UPDATE members SET ranking_enabled=? WHERE group_id=? AND user_id=?',enabled?1:0,groupId,userId);return {rankingEnabled:enabled};
  }
  function members(userId,groupId) {
    owner(userId,groupId);return all('SELECT u.id,u.nickname FROM members m JOIN users u ON m.user_id=u.id WHERE group_id=? ORDER BY m.joined_at',groupId);
  }
  function transfer(userId,groupId,targetId) {
    owner(userId,groupId);membership(targetId,groupId);
    return transaction(()=>{run('UPDATE groups SET owner_id=? WHERE id=?',targetId,groupId);
      run('DELETE FROM invites WHERE group_id=?',groupId);return {ok:true};});
  }
  function leave(userId,groupId) {
    const member=membership(userId,groupId);
    return transaction(()=>{
      if(member.owner_id===userId){requireThat(one('SELECT COUNT(*) AS n FROM members WHERE group_id=?',groupId).n===1,409,'TRANSFER_REQUIRED','请先将组长转让给其他成员');run('DELETE FROM groups WHERE id=?',groupId);}
      else run('DELETE FROM members WHERE group_id=? AND user_id=?',groupId,userId);
      return {ok:true};
    });
  }
  function removeMember(userId,groupId,targetId) {
    owner(userId,groupId);requireThat(userId!==targetId,400,'USE_LEAVE','请使用退出小组');
    run('DELETE FROM members WHERE group_id=? AND user_id=?',groupId,targetId);return {ok:true};
  }
  async function verifyPassword(userId,password) {
    const user=one('SELECT password_hash FROM users WHERE id=?',userId);
    requireThat(user&&await passwordMatches(password,user.password_hash),401,'PASSWORD_INCORRECT','当前密码不正确');
  }
  async function changePassword(userId,body) {
    await verifyPassword(userId,body.currentPassword);const next=await hashPassword(validatePassword(body.newPassword));
    transaction(()=>{run('UPDATE users SET password_hash=? WHERE id=?',next,userId);run('DELETE FROM sessions WHERE user_id=?',userId);});return {ok:true};
  }
  async function deleteAccount(userId,password) {
    await verifyPassword(userId,password);
    return transaction(()=>{
      const owned=all('SELECT id FROM groups WHERE owner_id=?',userId);
      requireThat(owned.every(g=>one('SELECT COUNT(*) AS n FROM members WHERE group_id=?',g.id).n===1),409,'TRANSFER_REQUIRED','请先转让仍有其他成员的小组，再删除账号');
      owned.forEach(g=>run('DELETE FROM groups WHERE id=?',g.id));run('DELETE FROM users WHERE id=?',userId);return {ok:true};
    });
  }
  function exportAccount(userId) {
    return {format:'aca-unified-v2',version:2,growth:growth.get(userId),importedOriginals:growth.archive(userId),exportedAt:clock(),profile:publicUser(one('SELECT * FROM users WHERE id=?',userId)),
      events:all('SELECT kind,subject,day,points,created_at AS createdAt FROM events WHERE user_id=? ORDER BY day',userId),groups:groups(userId)};
  }
  return {growth,register,login,authenticate,summary,record,createGroup,newInvite,previewInvite,join,board,setRanking,members,transfer,leave,removeMember,changePassword,deleteAccount,exportAccount,
    logout:value=>{run('DELETE FROM sessions WHERE token_hash=?',digest(value));return {ok:true};},
    revokeInvite:(userId,groupId)=>{owner(userId,groupId);run('DELETE FROM invites WHERE group_id=?',groupId);return {ok:true};},
    close:()=>db.close()};
}
