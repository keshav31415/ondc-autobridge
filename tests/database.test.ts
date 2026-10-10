import { describe,it,expect,afterAll } from 'vitest';
import { Database } from '../apps/api/src/database';
import { placeOrder } from '../packages/core/src/commerce';
import { productSchema } from '../packages/core/src/domain';
const db=await Database.open(undefined,true);afterAll(()=>db.close());
describe('durable merchant transactions',()=>{
  it('serializes concurrent last-item reservations and isolates businesses',async()=>{const id=await db.createAccount('a@example.test','unused');const other=await db.createAccount('b@example.test','unused');await db.mutate(id,s=>{s.products=[productSchema.parse({sku:'ONE',name:'One item',price:10000,mrp:10000,stock:1,weight:100})];});const results=await Promise.allSettled([1,2].map(i=>db.mutate(id,s=>placeOrder(s,{items:[{sku:'ONE',quantity:1}],pincode:'110001',customer:'Test customer',address:'Test address',idempotencyKey:`checkout-${i}`},{id:'q',provider:'Simulator',cost:0,estimatedDays:3,serviceable:true,simulated:true,expiresAt:'2099-01-01'}))));expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await db.read(id)).products[0].reserved).toBe(1);expect((await db.read(other)).orders).toHaveLength(0);});
  it('rolls back mutations when an operation fails',async()=>{const id=await db.createAccount('rollback@example.test','unused');await expect(db.mutate(id,s=>{s.rules.minOrder=90000;throw new Error('abort');})).rejects.toThrow();expect((await db.read(id)).rules.minOrder).toBe(0);});
});
