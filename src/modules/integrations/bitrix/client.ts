const MOCK = process.env.B24_MOCK === "1";

import { request } from "undici";
import type { InventoryPayload } from "../../logic/documents.js";
import { AppError, BadRequest } from "../../utils/errors.js";

export type ProductRow = {
  productId: number;
  quantity: number;
  price?: number;
  measureCode?: number;
};

export class BitrixClient {
  constructor(private readonly webhookBase?: string) {
    if (!webhookBase && !MOCK) throw new BadRequest("B24_WEBHOOK_URL is not configured");
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
        select: ["productId", "quantity", "price", "measureCode"],
      }
    );
    return result.items;
  }

  async createInventoryDocument(
    payload: InventoryPayload
  ): Promise<{ documentId: number; itemsProcessed?: number }> {
    if (MOCK) return { documentId: 999, itemsProcessed: payload.items.length };
    // Пример: catalog.document.add + catalog.document.save (зависит от конкретной схемы Inventory API на портале)
    // Для тестового — одна обёртка. Ты при интеграции подставишь нужный метод: e.g. catalog.document.add
    const result = await this.call<{ document: { id: number } }>(
      "catalog.document.add",
      {
        fields: payload,
      }
    );
    return {
      documentId: result.document.id,
      itemsProcessed: payload?.items?.length,
    };
  }
}
