import type { ProductRow } from "../integrations/bitrix/client.js";
import { BadRequest, NotFound } from "../utils/errors.js";

export type DocType = "A" | "D" | "M"; // A=приход, D=списание, M=перемещение

export type InventoryPayload = {
  docType: DocType;
  contractorId?: number;
  comment?: string;
  responsibleId?: number;
  storeId?: number;
  storeFrom?: number;
  storeTo?: number;
  currency?: string;
  products: Array<{
    productId: number;
    quantity: number;
    price?: number;
    currency?: string;
    measureCode?: number;
  }>;
};

export function buildDocumentFromRows(params: {
  docType: DocType;
  rows: ProductRow[];
  storeId?: number;
  storeFrom?: number;
  storeTo?: number;
  comment?: string;
  responsibleId?: number;
}): InventoryPayload {
  const { docType, rows, storeId, storeFrom, storeTo, comment, responsibleId } =
    params;

  if (!rows?.length) throw new NotFound("No product rows for element");

  const defaultCurrency = process.env.DEFAULT_CURRENCY || "KZT";

  const products = rows.map((row) => {
    const priceValue =
      row.price === undefined || row.price === null
        ? undefined
        : Number(row.price);
    const measureValue =
      row.measureCode === undefined || row.measureCode === null
        ? undefined
        : Number(row.measureCode);

    return {
      productId: row.productId,
      quantity: Number(row.quantity),
      price:
        priceValue === undefined || Number.isNaN(priceValue)
          ? undefined
          : priceValue,
      currency: row.currency || defaultCurrency,
      measureCode:
        measureValue === undefined || Number.isNaN(measureValue)
          ? undefined
          : measureValue,
    };
  });

  const base = {
    docType,
    comment,
    responsibleId,
    currency: defaultCurrency,
    products,
  };

  if (docType === "M") {
    if (!storeFrom || !storeTo)
      throw new BadRequest("storeFrom and storeTo are required for transfer");
    return { ...base, storeFrom, storeTo };
  }
  if (!storeId) throw new BadRequest("storeId is required for A|D");
  return { ...base, storeId };
}
