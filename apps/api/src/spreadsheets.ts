import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import {
  assert,
  productSchema,
  type Product,
} from "../../../packages/core/src/domain";

export const importFields = [
  "sku",
  "name",
  "price",
  "mrp",
  "stock",
  "weight",
  "category",
  "variant",
  "length",
  "width",
  "height",
  "taxRate",
  "image",
] as const;
export type ImportField = (typeof importFields)[number];
export type Mapping = Record<ImportField, string>;
export type RawRow = Record<string, string>;
const aliases: Record<ImportField, string[]> = {
  sku: ["sku", "productcode", "itemcode", "code"],
  name: ["productname", "itemname", "itemdesc", "prodname", "name"],
  price: [
    "sellingprice",
    "saleprice",
    "price",
    "discountedmrp",
    "sellingpricers",
  ],
  mrp: ["mrp", "maximumretailprice"],
  stock: ["stock", "quantity", "qty", "stockleft", "stockonhand"],
  weight: ["weight", "weightg", "weightgrams"],
  category: ["category"],
  variant: ["variant", "sizecolour", "sizecolor"],
  length: ["length", "lengthcm"],
  width: ["width", "widthcm"],
  height: ["height", "heightcm"],
  taxRate: ["taxrate", "gstrate", "tax", "gst"],
  image: ["image", "imageurl", "imagelink"],
};
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function inspectZip(bytes: Buffer) {
  // Reject oversized XLSX archives before ExcelJS expands their entries.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  assert(end >= 0, "Invalid XLSX archive");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16),
    expanded = 0;
  assert(count < 5000, "Spreadsheet has too many archive entries");
  for (let i = 0; i < count; i++) {
    assert(
      offset + 46 <= bytes.length && bytes.readUInt32LE(offset) === 0x02014b50,
      "Invalid XLSX directory",
    );
    expanded += bytes.readUInt32LE(offset + 24);
    assert(expanded < 50 * 1024 * 1024, "Expanded spreadsheet exceeds 50 MB");
    offset +=
      46 +
      bytes.readUInt16LE(offset + 28) +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
  }
}
export async function readSpreadsheet(bytes: Buffer, filename: string) {
  assert(
    bytes.length > 0 && bytes.length <= 5 * 1024 * 1024,
    "Upload a file between 1 byte and 5 MB",
  );
  const book = new ExcelJS.Workbook();
  if (filename.toLowerCase().endsWith(".xlsx")) {
    inspectZip(bytes);
    await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  } else if (filename.toLowerCase().endsWith(".csv"))
    await book.csv.read(Readable.from(bytes), {
      map: (value: string) => value,
    });
  else throw new Error("Please upload an .xlsx or .csv file");
  const sheet = book.worksheets[0];
  assert(
    sheet && sheet.rowCount >= 2,
    "The first worksheet needs a header and at least one product",
  );
  assert(
    sheet.rowCount <= 5001 && sheet.columnCount <= 60,
    "Maximum 5,000 products and 60 columns",
  );
  function text(cell: ExcelJS.Cell) {
    const value = cell.value;
    if (value === null || value === undefined) return "";
    if (typeof value === "object") {
      assert(
        !("formula" in value) && !("sharedFormula" in value),
        "Replace formula cells with their values before uploading",
      );
      if ("richText" in value)
        return value.richText.map((t) => t.text).join("");
      if ("text" in value) return value.text;
      if (value instanceof Date) return value.toISOString();
      throw new Error("Unsupported spreadsheet cell");
    }
    return String(value).trim();
  }
  const headers: string[] = [];
  for (let i = 1; i <= sheet.columnCount; i++)
    headers.push(text(sheet.getRow(1).getCell(i)));
  assert(headers.every(Boolean), "Every column needs a header");
  assert(
    new Set(headers).size === headers.length,
    "Column headers must be unique",
  );
  const rows: RawRow[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row: RawRow = Object.create(null);
    headers.forEach((header, j) => {
      row[header] = text(sheet.getRow(i).getCell(j + 1));
    });
    if (Object.values(row).some(Boolean)) rows.push(row);
  }
  const mapping = Object.fromEntries(
    importFields.map((field) => [
      field,
      headers.find((h) => aliases[field].includes(normalize(h))) ?? "",
    ]),
  ) as Mapping;
  return { headers, rows, mapping };
}
export function mapRows(rows: RawRow[], mapping: Mapping) {
  const errors: { row: number; field: string; message: string }[] = [];
  const products: Product[] = [];
  const seen = new Set<string>();
  for (const field of ["sku", "name", "price", "stock", "weight"] as const)
    if (!mapping[field])
      errors.push({ row: 1, field, message: `Choose a column for ${field}` });
  if (errors.length) return { products, errors };
  rows.forEach((row, index) => {
    const get = (field: ImportField) => row[mapping[field]]?.trim() ?? "";
    const number = (field: ImportField, fallback?: number) => {
      const value = get(field);
      if (!value && fallback !== undefined) return fallback;
      return value ? Number(value.replace(/[₹,\s]/g, "")) : NaN;
    };
    const price = Math.round(number("price") * 100);
    const result = productSchema.safeParse({
      sku: get("sku"),
      name: get("name"),
      price,
      mrp: Math.round(number("mrp", price / 100) * 100),
      stock: number("stock"),
      reserved: 0,
      weight: number("weight"),
      length: number("length", 15),
      width: number("width", 10),
      height: number("height", 10),
      taxRate: number("taxRate", 0),
      category: get("category") || "Packaged food",
      variant: get("variant"),
      image: get("image"),
      enabled: true,
    });
    if (seen.has(get("sku")))
      errors.push({
        row: index + 2,
        field: "sku",
        message: "Duplicate product code",
      });
    seen.add(get("sku"));
    if (result.success) products.push(result.data);
    else
      for (const issue of result.error.issues)
        errors.push({
          row: index + 2,
          field: issue.path.join("."),
          message: issue.message,
        });
  });
  return { products, errors };
}
export const sampleProducts: Product[] = [
  ["TUR-200", "Lakadong turmeric", 249, 299, 42, 200, "Spices"],
  ["TEA-100", "Assam breakfast tea", 349, 399, 28, 100, "Tea & coffee"],
  ["HON-250", "Wild forest honey", 449, 499, 16, 250, "Honey"],
  ["COF-250", "Coorg filter coffee", 399, 449, 8, 250, "Tea & coffee"],
  ["PEP-100", "Malabar black pepper", 229, 279, 34, 100, "Spices"],
  ["OIL-500", "Cold-pressed coconut oil", 549, 599, 12, 500, "Cooking oils"],
  ["MIL-500", "Organic finger millet", 179, 199, 56, 500, "Grains"],
  ["JAG-500", "Palm jaggery", 299, 349, 4, 500, "Sweeteners"],
].map(([sku, name, price, mrp, stock, weight, category]) =>
  productSchema.parse({
    sku,
    name,
    price: Number(price) * 100,
    mrp: Number(mrp) * 100,
    stock,
    weight,
    category,
  }),
);
export async function createSpreadsheet(products = sampleProducts) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Inventory");
  sheet.columns = [
    ["SKU", "sku", 18],
    ["Product Name", "name", 30],
    ["Selling Price", "price", 16],
    ["MRP", "mrp", 12],
    ["Stock", "stock", 12],
    ["Weight (g)", "weight", 14],
    ["Category", "category", 20],
    ["Variant", "variant", 20],
    ["Length (cm)", "length", 14],
    ["Width (cm)", "width", 14],
    ["Height (cm)", "height", 14],
    ["Tax Rate", "taxRate", 12],
    ["Image URL", "image", 36],
  ].map(([header, key, width]) => ({
    header: String(header),
    key: String(key),
    width: Number(width),
  }));
  for (const p of products) {
    const row = { ...p, price: p.price / 100, mrp: p.mrp / 100 };
    sheet.addRow(
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [
          k,
          typeof v === "string" && /^[=+@-]/.test(v) ? `'${v}` : v,
        ]),
      ),
    );
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF234D3E" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const notes = book.addWorksheet("Read me");
  notes.getColumn(1).width = 110;
  for (const note of [
    "Prices are INR including tax. Stock means physical stock, not available stock.",
    "Use one unique SKU for every variant. Weight is grams; dimensions are centimetres.",
    "Replace sample products with your own. Import updates matching SKUs; omitted SKUs stay unchanged.",
    "Reserved stock is preserved. A stale preview must be refreshed before importing.",
    "Formula cells must be converted to values. Tax classification must be confirmed by the business.",
  ])
    notes.addRow([note]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
