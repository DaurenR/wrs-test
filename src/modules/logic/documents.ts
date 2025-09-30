import type { ProductRow } from "../integrations/bitrix/client.js";
import { BadRequest } from "../utils/errors.js";

export type DocType = "A" | "D" | "M"; // A=приход, D=списание, M=перемещение

export type InventoryPayload = {
  docType: DocType;
  contractorId?: number;
  comment?: string;
  responsibleId?: number;
  storeId?: number;
  storeFrom?: number;
  storeTo?: number;
  items: Array<{
    productId: number;
    amount: number;
    // при необходимости: price, measureCode
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

  if (!rows?.length) throw new BadRequest("No product rows");

  const items = rows.map((r) => ({
    productId: r.productId,
    amount: Number(r.quantity),
  }));

  const base = { docType, comment, responsibleId, items };

  if (docType === "M") {
    if (!storeFrom || !storeTo)
      throw new BadRequest("storeFrom and storeTo are required for transfer");
    return { ...base, storeFrom, storeTo };
  }
  if (!storeId) throw new BadRequest("storeId is required for A|D");
  return { ...base, storeId };
}
