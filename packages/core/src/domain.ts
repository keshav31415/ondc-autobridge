import { z } from 'zod';

export const productSchema = z.object({
  sku: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100).default('Packaged food'),
  variant: z.string().max(100).default(''), price: z.number().int().min(1).max(100000000),
  mrp: z.number().int().min(1).max(100000000), stock: z.number().int().min(0).max(1000000),
  reserved: z.number().int().min(0).default(0), weight: z.number().positive().max(100000),
  length: z.number().positive().max(1000).default(15), width: z.number().positive().max(1000).default(10),
  height: z.number().positive().max(1000).default(10), taxRate: z.number().min(0).max(100).default(0),
  image: z.union([z.literal(''), z.url().refine(v => v.startsWith('https://'), 'Use an HTTPS image URL')]).default(''),
  enabled: z.boolean().default(true),
}).refine(p => p.mrp >= p.price, { message: 'MRP cannot be below selling price', path: ['mrp'] });
export type Product = z.infer<typeof productSchema>;

export const rulesSchema = z.object({
  minOrder: z.number().int().min(0).max(100000000).default(0), maxPerItem: z.number().int().min(1).max(10000).default(10),
  safetyStock: z.number().int().min(0).max(10000).default(0), lowStock: z.number().int().min(0).max(10000).default(5),
  shippingMode: z.enum(['actual', 'flat', 'free']).default('actual'), flatShipping: z.number().int().min(0).max(1000000).default(4900),
  freeShippingAbove: z.number().int().min(0).max(100000000).nullable().default(99900),
  dispatchDays: z.number().int().min(0).max(30).default(2), cutoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('16:00'),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1,2,3,4,5,6]),
  excludedPincodes: z.array(z.string().regex(/^[1-9]\d{5}$/)).max(500).default([]),
  logisticsPreference: z.enum(['lowest_price', 'fastest']).default('lowest_price'),
  discountPercent: z.number().min(0).max(90).default(0), acceptingOrders: z.boolean().default(true),
  returnDays: z.number().int().min(0).max(30).default(7), cancellationUntil: z.enum(['confirmed', 'packed', 'ready']).default('packed'),
  specialInstructions: z.string().max(3000).default(''),
});
export type Rules = z.infer<typeof rulesSchema>;
export const businessSchema = z.object({
  name: z.string().trim().min(2).max(120), owner: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
  email: z.email(), address: z.string().trim().min(8).max(300), city: z.string().trim().min(2).max(100),
  pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit pincode'),
  domain: z.enum(['ONDC:RET10','ONDC:RET12','ONDC:RET13','ONDC:RET14','ONDC:RET15']).default('ONDC:RET10'),
  registration: z.string().max(100).default(''), participation: z.enum(['undecided', 'inventory_seller', 'existing_seller_app']).default('undecided'),
});
export type Business = z.infer<typeof businessSchema>;
export const cartSchema = z.object({
  items: z.array(z.object({ sku: z.string().min(1).max(80), quantity: z.number().int().min(1).max(10000) })).min(1).max(100),
  pincode: z.string().regex(/^[1-9]\d{5}$/), customer: z.string().trim().min(2).max(100).default('Test customer'),
  address: z.string().trim().min(5).max(300).default('Simulation address'),
  idempotencyKey: z.string().min(8).max(150),
});
export type Cart = z.infer<typeof cartSchema>;
export type ShippingQuote = { id: string; provider: string; cost: number; estimatedDays: number; serviceable: boolean; simulated: boolean; expiresAt: string };
export type Quote = { items: { sku: string; name: string; quantity: number; unitPrice: number; total: number }[]; subtotal: number; discount: number; shipping: number; carrierCost: number; total: number; includedTax: number; ruleVersion: number; dispatchBy: string; shippingQuote: ShippingQuote };
export type OrderStatus = 'reserved'|'confirmed'|'packed'|'ready'|'picked_up'|'in_transit'|'delivery_failed'|'delivered'|'cancelled'|'returned';
export type Order = { id: string; key: string; customer: string; address: string; pincode: string; quote: Quote; rules: Rules; status: OrderStatus; simulated: boolean; payment: 'simulated_paid'|'pending'|'paid'|'refund_pending'|'refunded'; createdAt: string; updatedAt: string; reservationExpiresAt?: string; shipment?: { id: string; provider: string; tracking: string; status: string }; history: { at: string; event: string }[] };
export type Ticket = { id: string; orderId: string; type: 'return'|'cancellation'|'delivery'|'other'; reason: string; status: 'open'|'reviewing'|'resolved'; createdAt: string; resolution?: string };
export type Build = { id: string; status: 'queued'|'running'|'passed'|'failed'; mode: 'template'|'cline'; version: number; createdAt: string; finishedAt?: string; logs: { at: string; message: string }[]; artifact?: string; error?: string; };
export type Audit = { at: string; action: string; detail: string };
export type MerchantState = { business: Business|null; rules: Rules; ruleVersion: number; inventoryVersion: number; products: Product[]; orders: Order[]; tickets: Ticket[]; builds: Build[]; audit: Audit[]; onboardingStep: number; onboarded: boolean; demo: boolean };
export function initialState(demo = false): MerchantState { return { business: null, rules: rulesSchema.parse({}), ruleVersion: 1, inventoryVersion: 0, products: [], orders: [], tickets: [], builds: [], audit: [], onboardingStep: 0, onboarded: false, demo }; }
export function record(state: MerchantState, action: string, detail: string) { state.audit.unshift({at: new Date().toISOString(), action, detail}); }
export class DomainError extends Error { constructor(message: string, public status = 400, public code = 'INVALID_REQUEST') { super(message); } }
export function assert(condition: unknown, message: string, status = 400): asserts condition { if (!condition) throw new DomainError(message, status); }
export function money(paise: number) { return new Intl.NumberFormat('en-IN', {style: 'currency', currency: 'INR', maximumFractionDigits: 2}).format(paise / 100); }
