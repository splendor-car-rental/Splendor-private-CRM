import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('purchase-order source of truth', () => {
  it('routes every purchase-order alias to the durable procurement UI', () => {
    const app = read('src/App.tsx');

    expect(app).not.toContain("./components/views/PurchaseOrdersManagementView");
    expect(app).toMatch(/case 'procurement':[\s\S]*case 'purchase-orders':[\s\S]*case 'lpo':[\s\S]*case 'supply-orders': return <ProcurementView \/>/);
  });

  it('does not navigate from the durable register into the browser-only shadow register', () => {
    const procurement = read('src/components/views/ProcurementView.tsx');

    expect(procurement).not.toContain("setActiveView('purchase-orders')");
    expect(procurement).not.toContain('splendor_purchase_orders_list');
    expect(procurement).toContain("apiFetch('/api/purchase-orders')");
  });

  it('removes the browser-only register and its unaudited document renderer', () => {
    expect(() => read('src/components/views/PurchaseOrdersManagementView.tsx')).toThrow();
    expect(() => read('src/components/operations/PurchaseOrderLetterheadModal.tsx')).toThrow();
  });

  it('attaches stable idempotency keys to purchase-order creation', () => {
    const apiFetch = read('src/lib/apiFetch.ts');

    expect(apiFetch).toContain("path === '/api/purchase-orders'");
  });
});
