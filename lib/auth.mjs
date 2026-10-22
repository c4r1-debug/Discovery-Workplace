import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import db from './db.mjs';
export function passwordHash(password){if(typeof password!=='string'||password.length<12||password.length>256)throw Error('Use a password between 12 and 256 characters.');const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
export function verify(password,hash){if(typeof password!=='string'||password.length>256)return false;const [salt,expected]=hash.split(':');return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(expected,'hex'));}
export function setupNeeded(){return !db.prepare('SELECT name FROM users LIMIT 1').get();}
const digest=t=>createHash('sha256').update(t).digest('hex');
export function login(name,password){const u=db.prepare('SELECT * FROM users WHERE lower(name)=lower(?)').get(String(name||'').trim());if(!u||!verify(password,u.hash))throw Error('Incorrect username or password.');const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),u.name,Date.now()+7*86400000);return token;}
export function userFrom(request){const token=request.cookies.get('discovery_session')?.value;if(!token)return null;const u=db.prepare('SELECT name FROM sessions WHERE token=? AND expires>?').get(digest(token),Date.now());return u?.name||null;}
export function logout(request){const token=request.cookies.get('discovery_session')?.value;if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));}
export function rateLimit(key,max=10,window=60000){const now=Date.now();db.prepare('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END').run(key,now+window,now,now);if(db.prepare('SELECT count FROM limits WHERE key=?').get(key).count>max)throw Error('Too many requests. Please try again later.');}
