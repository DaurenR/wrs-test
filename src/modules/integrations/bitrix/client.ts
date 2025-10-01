const MOCK = process.env.B24_MOCK === "1";
const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY;

import { request } from "undici";
import type { InventoryPayload } from "../../logic/documents.js";
import { AppError, BadRequest } from "../../utils/errors.js";

export type ProductRow = {
  productId: number;
  quantity: number | string;
  price?: number | string;
  measureCode?: number | string;
  currency?: string;
};

export class BitrixClient {
  constructor(private readonly webhookBase?: string) {
    if (!webhookBase && !MOCK)
      throw new BadRequest("B24_WEBHOOK_URL is not configured");
  }

  private async call<T>(
    method: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = this.webhookBase!.replace(/\/$/, "") + "/" + method;
    const { body: resBody, statusCode } = await request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await resBody.json()) as any;
    if (statusCode >= 400 || data.error) {
      const msg = data.error_description || data.error || `HTTP ${statusCode}`;
      throw new AppError(502, `Bitrix24 error: ${msg}`);
    }
    return (data.result ?? data) as T;
  }

  async getDealProductRows(dealId: number): Promise<ProductRow[]> {
    if (MOCK) return [{ productId: 101, quantity: 2 }];
    // crm.deal.productrows.get?ID=
    return await this.call<ProductRow[]>("crm.deal.productrows.get", {
      id: dealId,
    });
  }

  async getSpaProductRows(
    entityTypeId: number,
    ownerId: number
  ): Promise<ProductRow[]> {
    if (MOCK) return [{ productId: 202, quantity: 5 }];
    // crm.item.productrow.list with filter { ownerId, entityTypeId }
    const result = await this.call<{ items: ProductRow[] }>(
      "crm.item.productrow.list",
      {
        filter: { ownerId, entityTypeId },
        select: ["productId", "quantity", "price", "measureCode", "currency"],
      }
    );
    return result.items;
  }

  async createInventoryDocument(
    payload: InventoryPayload
  ): Promise<{ documentId: number; itemsProcessed?: number }> {
    if (MOCK)
      return { documentId: 999, itemsProcessed: payload.products.length };

    const currency = payload.currency || DEFAULT_CURRENCY || "KZT";

    const fields: Record<string, unknown> = {
      DOC_TYPE: payload.docType,
      CURRENCY: currency,
    };

    if (payload.comment !== undefined) fields.COMMENT = payload.comment;
    if (payload.responsibleId !== undefined)
      fields.RESPONSIBLE_ID = payload.responsibleId;

    if (payload.docType === "M") {
      if (payload.storeFrom !== undefined)
        fields.STORE_FROM = payload.storeFrom;
      if (payload.storeTo !== undefined) fields.STORE_TO = payload.storeTo;
    } else if (payload.storeId !== undefined) {
      fields.STORE_ID = payload.storeId;
    }

    const result = await this.call<{ document: { id: number } }>(
      "catalog.document.add",
      {
        fields,
      }
    );

    const documentId = result.document.id;

    let itemsProcessed = 0;
    for (const product of payload.products) {
      const productFields: Record<string, unknown> = {
        DOCUMENT_ID: documentId,
        PRODUCT_ID: product.productId,
        QUANTITY: product.quantity,
        PRICE: product.price ?? 0,
        CURRENCY: product.currency || currency,
      };

      if (product.measureCode !== undefined)
        productFields.MEASURE_CODE = product.measureCode;

      await this.call("catalog.document.product.add", {
        fields: productFields,
      });
      itemsProcessed += 1;
    }

    return {
      documentId,
      itemsProcessed,
    };
  }
}
