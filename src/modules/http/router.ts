import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { signatureOk } from "../utils/signature.js";
import { BitrixClient } from "../integrations/bitrix/client.js";
import { buildDocumentFromRows, DocType } from "../logic/documents.js";
import { AppError, BadRequest, NotFound } from "../utils/errors.js";

const querySchema = z.object({
  elemId: z
    .string()
    .transform((v) => Number(v))
    .pipe(z.number().int().positive()),
  // Владелец: приоритет у краткого типа
  ownerTypeShort: z.enum(["D", "S"]).optional(), // D=Deal, S=SPA
  elemType: z.enum(["D", "S"]).optional(),
  spaTypeId: z
    .string()
    .transform((v) => Number(v))
    .optional(), // entityTypeId

  docType: z.enum(["A", "D", "M"]), // A=Приход, D=Списание, M=Перемещение

  storeId: z
    .string()
    .transform((v) => Number(v))
    .optional(),
  storeFrom: z
    .string()
    .transform((v) => Number(v))
    .optional(),
  storeTo: z
    .string()
    .transform((v) => Number(v))
    .optional(),

  responsibleId: z
    .string()
    .transform((v) => Number(v))
    .optional(),
  comment: z.string().max(500).optional(),

  ts: z.string().optional(),
  sig: z.string().optional(),
});

type Q = z.infer<typeof querySchema>;

function resolveOwner(q: Q): { owner: "deal" | "spa"; entityTypeId?: number } {
  if (q.ownerTypeShort === "D") return { owner: "deal" };
  if (q.ownerTypeShort === "S") return { owner: "spa" };
  if (q.elemType === "D") return { owner: "deal" };
  if (q.elemType === "S" && q.spaTypeId)
    return { owner: "spa", entityTypeId: Number(q.spaTypeId) };
  throw new BadRequest(
    "Owner not specified. Provide ownerTypeShort=D|S or elemType+spaTypeId for SPA"
  );
}

function validateStores(q: Q) {
  if (q.docType === "M") {
    if (!q.storeFrom || !q.storeTo)
      throw new BadRequest("storeFrom and storeTo are required for docType=M");
  } else {
    if (!q.storeId) throw new BadRequest("storeId is required for docType=A|D");
  }
}

export const router: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.all("/process_docs_external", async (req, reply) => {
    const start = Date.now();
    try {
      const parsed = querySchema.parse(req.query);

      // Бонус: проверка подписи
      if (process.env.SIGN_KEY && (parsed.sig || parsed.ts)) {
        if (!signatureOk(parsed.sig!, parsed.ts!))
          throw new BadRequest("Invalid signature");
      }

      validateStores(parsed);
      const { owner, entityTypeId } = resolveOwner(parsed);

      const b24 = new BitrixClient(process.env.B24_WEBHOOK_URL);

      // 1) Получаем товарные строки
      const rows =
        owner === "deal"
          ? await b24.getDealProductRows(parsed.elemId)
          : await b24.getSpaProductRows(entityTypeId!, parsed.elemId);

      if (!rows.length) throw new NotFound("No product rows for element");

      // 2) Готовим документ инвентаризации
      const payload = buildDocumentFromRows({
        docType: parsed.docType as DocType,
        rows,
        storeId: parsed.storeId,
        storeFrom: parsed.storeFrom,
        storeTo: parsed.storeTo,
        comment: parsed.comment,
        responsibleId: parsed.responsibleId,
      });

      const { documentId, itemsProcessed } = await b24.createInventoryDocument(
        payload
      );

      const storesInfo =
        parsed.docType === "M"
          ? { from: parsed.storeFrom, to: parsed.storeTo }
          : { id: parsed.storeId };

      const response = {
        status: "ok" as const,
        owner,
        elemId: parsed.elemId,
        docType: parsed.docType,
        stores: storesInfo,
        rowsFound: rows.length,
        rowsProcessed: itemsProcessed ?? rows.length,
        message: `Document created: ${documentId}`,
      };

      req.log.info(
        {
          owner,
          docType: parsed.docType,
          elemId: parsed.elemId,
          stores: storesInfo,
          rowsFound: rows.length,
          rowsProcessed: response.rowsProcessed,
          documentId,
        },
        "Inventory document created"
      );

      reply.send(response);
    } catch (err) {
      const error = err as unknown;
      req.log.error(
        {
          err: error,
          request: {
            query: req.query,
            params: req.params,
            body: req.body,
          },
        },
        "Failed to process /process_docs_external request"
      );

      if (error instanceof AppError) {
        reply.status(error.httpCode).send({
          status: "error",
          code: error.httpCode,
          message: error.message,
        });
        return;
      }

      if (error instanceof z.ZodError) {
        const message = error.errors.map((issue) => issue.message).join("; ");
        reply.status(400).send({ status: "error", code: 400, message });
        return;
      }

      const message =
        error instanceof Error ? error.message : "Internal Server Error";
      reply.status(500).send({ status: "error", code: 500, message });
    } finally {
      const durationMs = Date.now() - start;
      req.log.info(
        {
          durationMs,
          route: "/process_docs_external",
          docType: (req.query as any)?.docType,
          elemId: (req.query as any)?.elemId,
        },
        "Processed /process_docs_external"
      );
    }
  });
};
