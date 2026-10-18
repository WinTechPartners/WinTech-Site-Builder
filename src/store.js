import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import { DATA, BUDGET_MICRO } from './config.js';

export class Store {
  constructor(filename = path.join(DATA, 'studio.sqlite')) {
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, url TEXT UNIQUE NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, job TEXT NOT NULL, model TEXT NOT NULL, purpose TEXT NOT NULL, reserved INTEGER NOT NULL, charged INTEGER NOT NULL, state TEXT NOT NULL, detail TEXT, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS public_names (slug TEXT PRIMARY KEY, job TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }
  get(id) { const row = this.db.prepare('SELECT data FROM jobs WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; }
  list() { return this.db.prepare('SELECT data FROM jobs ORDER BY rowid DESC').all().map(r => JSON.parse(r.data)); }
  create(url, order) {
    const prospect = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    const old = this.db.prepare('SELECT id FROM jobs WHERE url=?').get(prospect);
    if (old) return this.get(old.id);
    const now = new Date().toISOString();
    const job = { id: crypto.randomUUID(), token: crypto.randomBytes(24).toString('hex'), url, state: 'queued', phase: 'Waiting to research', created: now, updated: now, events: [], modelOrder: order, attempts: 0, preview: null, error: null };
    this.db.prepare('INSERT INTO jobs VALUES (?,?,?,?)').run(job.id, prospect, job.state, JSON.stringify(job));
    return job;
  }
  save(job) { job.updated = new Date().toISOString(); this.db.prepare('UPDATE jobs SET state=?,data=? WHERE id=?').run(job.state, JSON.stringify(job), job.id); return job; }
  event(job, phase, detail = '') { job.phase = phase; job.events.push({ at: new Date().toISOString(), phase, detail }); return this.save(job); }
  budget(id) {
    const r = this.db.prepare('SELECT COALESCE(SUM(charged),0) AS charged, COALESCE(SUM(reserved),0) AS reserved FROM calls WHERE job=?').get(id);
    const cap=this.cap(id);
    return { cap: cap/1e6, accounted: r.charged / 1e6, reserved: r.reserved / 1e6, remaining: Math.max(0, (cap - r.charged) / 1e6), calls: this.db.prepare('SELECT id,model,purpose,reserved,charged,state,detail,created FROM calls WHERE job=?').all(id) };
  }
  cap(id){const cap=this.get(id)?.budgetCapMicro??BUDGET_MICRO;if(!Number.isSafeInteger(cap)||cap<1000||cap>900000)throw new Error('Invalid prospect budget cap');return cap;}
  reserve(job, model, purpose, micro) {
    if (!Number.isSafeInteger(micro) || micro <= 0) throw new Error('Invalid budget reservation');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const used = this.db.prepare('SELECT COALESCE(SUM(charged),0) AS total FROM calls WHERE job=?').get(job).total;
      if (used + micro > this.cap(job)) throw new Error(`BUDGET_CAP: $${(this.cap(job)/1e6).toFixed(2)} prospect allowance exhausted`);
      const id = crypto.randomUUID();
      this.db.prepare('INSERT INTO calls VALUES (?,?,?,?,?,?,?,?,?)').run(id, job, model, purpose, micro, micro, 'pending', null, new Date().toISOString());
      this.db.exec('COMMIT'); return id;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  settle(id, cost, detail) {
    const call = this.db.prepare('SELECT * FROM calls WHERE id=?').get(id);
    const charged = typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? Math.ceil(cost * 1e6) : call.reserved;
    this.db.prepare('UPDATE calls SET charged=?,state=?,detail=? WHERE id=?').run(charged, typeof cost === 'number' ? 'settled' : 'conservative', JSON.stringify(detail), id);
    if (charged > call.reserved) throw new Error('BILLING_ANOMALY: provider exceeded its reserved maximum; further generation stopped');
  }
  uncertain(id, reason) { this.db.prepare('UPDATE calls SET state=?,detail=? WHERE id=?').run('uncertain', JSON.stringify({ reason }), id); }
  recover() {
    for(const job of this.list())if(job.freeVerification?.state==='running'){job.freeVerification={...job.freeVerification,state:'interrupted',error:'Free verification interrupted by restart; safe to resume without model calls'};this.save(job);}
    this.db.prepare("UPDATE calls SET state='uncertain',detail='\"Interrupted request: reservation retained\"' WHERE state='pending'").run();
    for (const job of this.list()) if (['researching','generating','checking','repairing'].includes(job.state)) {
      job.state = 'failed'; job.error = 'Interrupted by restart. Any uncertain charges remain reserved. Retry continues the same cumulative prospect ledger.'; this.save(job);
    }
  }
  publicSlug(id){const old=this.db.prepare('SELECT slug FROM public_names WHERE job=?').get(id);if(old)return old.slug;const job=this.get(id);if(!job)throw new Error('Unknown prospect');const host=new URL(job.url).hostname.replace(/^www\./,'');let base=host.split('.')[0].toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/^-+|-+$/g,'').slice(0,36)||'partner';if(['list','assets','fonts','api','admin'].includes(base))base+='-preview';const suffix=crypto.createHash('sha256').update(id).digest('hex').slice(0,6);this.db.exec('BEGIN IMMEDIATE');try{const existing=this.db.prepare('SELECT slug FROM public_names WHERE job=?').get(id);if(existing){this.db.exec('COMMIT');return existing.slug;}const used=this.db.prepare('SELECT job FROM public_names WHERE slug=?').get(base);const slug=used?base+'-'+suffix:base;this.db.prepare('INSERT INTO public_names VALUES (?,?)').run(slug,id);this.db.exec('COMMIT');return slug;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  setting(key, value) {
    if (value !== undefined) this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
    return this.db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;
  }
}
