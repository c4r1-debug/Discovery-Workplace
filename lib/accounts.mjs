import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import db from './db.mjs';
import {passwordHash,verify,setupNeeded} from './auth.mjs';
const columns=db.prepare('PRAGMA table_info(users)').all().map(c=>c.name);
if(!columns.includes('role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
  db.exec("UPDATE users SET role='admin' WHERE rowid=(SELECT MIN(rowid) FROM users)");
}
if(!columns.includes('recovery'))db.exec('ALTER TABLE users ADD COLUMN recovery TEXT');
const digest=t=>createHash('sha256').update(t).digest('hex');
const recoveryCode=()=>randomBytes(24).toString('hex').match(/.{1,8}/g).join('-');
const normalizeCode=value=>String(value||'').replaceAll('-','').trim().toLowerCase();
export function roleFor(name){return db.prepare('SELECT role FROM users WHERE name=?').get(name)?.role||'member';}
export function register(username,password){
  const name=String(username||'').trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/.test(name))throw Error('Use 3–32 characters: letters, numbers, dots, hyphens or underscores.');
  const hash=passwordHash(password),code=recoveryCode();
  db.exec('BEGIN IMMEDIATE');
  try{if(db.prepare('SELECT name FROM users WHERE lower(name)=lower(?)').get(name))throw Error('That username is unavailable.');
    db.prepare('INSERT INTO users(name,hash,role,recovery) VALUES(?,?,?,?)').run(name,hash,setupNeeded()?'admin':'member',digest(normalizeCode(code)));
    db.exec('COMMIT');return {recoveryCode:code};
  }catch(e){db.exec('ROLLBACK');throw e;}
}
export function resetPassword(username,code,password){
  const u=db.prepare('SELECT * FROM users WHERE lower(name)=lower(?)').get(String(username||'').trim());
  const provided=digest(normalizeCode(code));
  if(!u?.recovery||!timingSafeEqual(Buffer.from(provided,'hex'),Buffer.from(u.recovery,'hex')))throw Error('Incorrect username or recovery code.');
  const hash=passwordHash(password),next=recoveryCode();
  db.exec('BEGIN IMMEDIATE');try{
    const result=db.prepare('UPDATE users SET hash=?,recovery=? WHERE name=? AND recovery=?').run(hash,digest(normalizeCode(next)),u.name,u.recovery);
    if(!result.changes)throw Error('Recovery code already used.');
    db.prepare('DELETE FROM sessions WHERE name=?').run(u.name);db.exec('COMMIT');return {recoveryCode:next};
  }catch(e){db.exec('ROLLBACK');throw e;}
}
export function renewRecovery(name,password){const u=db.prepare('SELECT * FROM users WHERE name=?').get(name);if(!u||!verify(password,u.hash))throw Error('Incorrect password.');const code=recoveryCode();db.prepare('UPDATE users SET recovery=? WHERE name=?').run(digest(normalizeCode(code)),name);return {recoveryCode:code};}
