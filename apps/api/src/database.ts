import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assert, initialState, type MerchantState } from '../../../packages/core/src/domain';

export interface Query { query<T extends Record<string,unknown>>(sql: string, params?: unknown[]): Promise<{rows:T[]}> }
export class Database implements Query {
  private constructor(private embedded?: PGlite, private pool?: pg.Pool) {}
  static async open(url = process.env.DATABASE_URL, memory = false) {
    let db: Database;
    if(url) db=new Database(undefined,new pg.Pool({connectionString:url,max:10,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined}));
    else {
      if(process.env.NODE_ENV==='production'&&!memory) throw new Error('DATABASE_URL is required in production');
      const directory=resolve(process.env.DATA_DIR??'.data','postgres');
      if(!memory) await mkdir(directory,{recursive:true});
      db=new Database(new PGlite(memory?undefined:directory));
    }
    await db.query(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await db.query(`CREATE TABLE IF NOT EXISTS merchants (id TEXT PRIMARY KEY REFERENCES accounts(id), state JSONB NOT NULL)`);
    await db.query(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires_at TIMESTAMPTZ NOT NULL)`);
    await db.query(`CREATE TABLE IF NOT EXISTS protocol_messages (id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES accounts(id), sender TEXT NOT NULL, action TEXT NOT NULL, request JSONB NOT NULL, response JSONB, status TEXT NOT NULL DEFAULT 'pending', attempts INT NOT NULL DEFAULT 0, next_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    return db;
  }
  async query<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]):Promise<{rows:T[]}> {
    if(this.embedded) return this.embedded.query<T>(sql,params);
    const result=await this.pool!.query<T>(sql,params);return {rows:result.rows};
  }
  async transaction<T>(fn:(q:Query)=>Promise<T>):Promise<T>{
    if(this.embedded) return this.embedded.transaction(async tx=>fn({query:async <R extends Record<string,unknown>>(sql:string,params:unknown[]=[])=>tx.query<R>(sql,params)}));
    const client=await this.pool!.connect();
    try{await client.query('BEGIN');const result=await fn({query:async <R extends Record<string,unknown>>(sql:string,params:unknown[]=[])=>{const r=await client.query<R>(sql,params);return {rows:r.rows};}});await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async createAccount(email:string,password:string,demo=false){const id=randomUUID();await this.transaction(async q=>{await q.query('INSERT INTO accounts (id,email,password) VALUES ($1,$2,$3)',[id,email,password]);await q.query('INSERT INTO merchants (id,state) VALUES ($1,$2::jsonb)',[id,JSON.stringify(initialState(demo))]);});return id;}
  async read(id:string){const {rows}=await this.query<{state:MerchantState}>('SELECT state FROM merchants WHERE id=$1',[id]);assert(rows[0],'Business not found',404);return rows[0].state;}
  async mutate<T>(id:string,fn:(state:MerchantState,q:Query)=>Promise<T>|T):Promise<T>{return this.transaction(async q=>{const {rows}=await q.query<{state:MerchantState}>('SELECT state FROM merchants WHERE id=$1 FOR UPDATE',[id]);assert(rows[0],'Business not found',404);const state=rows[0].state;const result=await fn(state,q);await q.query('UPDATE merchants SET state=$1::jsonb WHERE id=$2',[JSON.stringify(state),id]);return result;});}
  async close(){if(this.embedded)await this.embedded.close();if(this.pool)await this.pool.end();}
}
