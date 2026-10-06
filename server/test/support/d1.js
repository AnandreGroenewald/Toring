// A small Cloudflare D1-compatible adapter over node:sqlite, so tests run the real SQL.
// Mirrors the parts of the D1 API the worker uses: prepare().bind().first()/all()/run(), batch(), exec().

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCHEMA = fileURLToPath(new URL('../../schema.sql', import.meta.url));

function toParam(v) {
  // D1 rejects undefined; failing loudly here catches missing fields in the worker.
  if (v === undefined) throw new TypeError('D1_TYPE_ERROR: Type \'undefined\' not supported for value \'undefined\'');
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

const plain = (row) => (row ? { ...row } : row);

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
    db.prepare(sql); // syntax errors surface at prepare time, like D1
  }

  bind(...params) {
    return new Statement(this.db, this.sql, params.map(toParam));
  }

  _stmt() {
    return this.db.prepare(this.sql);
  }

  async first(column) {
    const row = plain(this._stmt().get(...this.params));
    if (!row) return null;
    return column === undefined ? row : (row[column] ?? null);
  }

  async all() {
    const results = this._stmt().all(...this.params).map(plain);
    return { success: true, results, meta: { changes: 0, rows_read: results.length } };
  }

  async run() {
    return this._runSync();
  }

  _runSync() {
    const isQuery = /^\s*(SELECT|WITH)\b/i.test(this.sql) || /\bRETURNING\b/i.test(this.sql);
    if (isQuery) {
      const results = this._stmt().all(...this.params).map(plain);
      return { success: true, results, meta: { changes: 0 } };
    }
    const info = this._stmt().run(...this.params);
    return {
      success: true,
      results: [],
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
    };
  }

  async raw() {
    return this._stmt().all(...this.params).map((r) => Object.values(r));
  }
}

export class D1Adapter {
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.queries = 0;
  }

  prepare(sql) {
    this.queries++;
    return new Statement(this.db, sql);
  }

  /** Atomic like D1: all statements commit together or none do. */
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const out = statements.map((s) => s._runSync());
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async exec(sql) {
    this.db.exec(sql);
    return { count: 1, duration: 0 };
  }

  /** Test helper: raw synchronous query. */
  q(sql, ...params) {
    return this.db.prepare(sql).all(...params).map(plain);
  }
}

export function createTestDb() {
  const d1 = new D1Adapter();
  d1.db.exec(readFileSync(SCHEMA, 'utf8'));
  return d1;
}
