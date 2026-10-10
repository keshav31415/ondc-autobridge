import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { readSpreadsheet, mapRows, createSpreadsheet } from '../apps/api/src/spreadsheets';
describe('spreadsheet onboarding',()=>{
  it('maps spreadsheet headers, rupee prices and quantities without confusing cost with price',async()=>{
    const data=await readSpreadsheet(Buffer.from('SKU,Product Name,Selling Price,MRP,Stock,Weight (g)\nT1,Tea,250,300,4,200\n'),'stock.csv');
    expect(mapRows(data.rows,data.mapping).errors).toEqual([]);
    expect(mapRows(data.rows,data.mapping).products[0]).toMatchObject({sku:'T1',price:25000,stock:4,reserved:0});
    const cost=await readSpreadsheet(Buffer.from('SKU,Product Name,Cost Price,Stock,Weight (g)\nT1,Tea,250,4,200'),'cost.csv');expect(cost.mapping.price).toBe('');
  });
  it('reports duplicate product codes and invalid rows before applying anything',async()=>{const d=await readSpreadsheet(Buffer.from('SKU,Product Name,Selling Price,MRP,Stock,Weight (g)\nT1,Tea,250,300,4,200\nT1,Tea,250,300,-2,200'),'stock.csv');expect(mapRows(d.rows,d.mapping).errors.length).toBeGreaterThan(0);});
  it('round trips genuine XLSX bytes',async()=>{const bytes=await createSpreadsheet();const d=await readSpreadsheet(bytes,'template.xlsx');expect(d.headers).toContain('SKU');expect(mapRows(d.rows,d.mapping).products.length).toBeGreaterThan(0);});
  it('rejects spreadsheet formula cells instead of trusting cached results',async()=>{const w=new ExcelJS.Workbook();const s=w.addWorksheet('Inventory');s.addRow(['SKU','Product Name','Selling Price','MRP','Stock','Weight (g)']);s.addRow(['T1','Tea',{formula:'1+1',result:2},300,4,200]);await expect(readSpreadsheet(Buffer.from(await w.xlsx.writeBuffer()),'formula.xlsx')).rejects.toThrow('formula');});
});
