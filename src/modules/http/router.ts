import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { signatureOk } from '../utils/signature.js'
import { BitrixClient } from '../integrations/bitrix/client.js'
import { buildDocumentFromRows, DocType } from '../logic/documents.js'
import { AppError, BadRequest, NotFound } from '../utils/errors.js'


const querySchema = z.object({
elemId: z.string().transform((v) => Number(v)).pipe(z.number().int().positive()),
// Владелец: приоритет у краткого типа
ownerTypeShort: z.enum(['D', 'S']).optional(), // D=Deal, S=SPA
elemType: z.enum(['D', 'S']).optional(),
spaTypeId: z.string().transform((v) => Number(v)).optional(), // entityTypeId


docType: z.enum(['A', 'D', 'M']), // A=Приход, D=Списание, M=Перемещение


storeId: z.string().transform((v) => Number(v)).optional(),
storeFrom: z.string().transform((v) => Number(v)).optional(),
storeTo: z.string().transform((v) => Number(v)).optional(),


responsibleId: z.string().transform((v) => Number(v)).optional(),
comment: z.string().max(500).optional(),


ts: z.string().optional(),
sig: z.string().optional()
})


type Q = z.infer<typeof querySchema>


function resolveOwner(q: Q): { owner: 'deal' | 'spa', entityTypeId?: number } {
if (q.ownerTypeShort === 'D') return { owner: 'deal' }
if (q.ownerTypeShort === 'S') return { owner: 'spa' }
if (q.elemType === 'D') return { owner: 'deal' }
if (q.elemType === 'S' && q.spaTypeId) return { owner: 'spa', entityTypeId: Number(q.spaTypeId) }
throw new BadRequest('Owner not specified. Provide ownerTypeShort=D|S or elemType+spaTypeId for SPA')
}


function validateStores(q: Q) {
if (q.docType === 'M') {
if (!q.storeFrom || !q.storeTo) throw new BadRequest('storeFrom and storeTo are required for docType=M')
} else {
if (!q.storeId) throw new BadRequest('storeId is required for docType=A|D')
}
}


export const router: FastifyPluginAsync = async (app: FastifyInstance) => {
app.all('/process_docs_external', async (req, reply) => {
try {
const parsed = querySchema.parse(req.query)


// Бонус: проверка подписи
if (process.env.SIGN_KEY && (parsed.sig || parsed.ts)) {
if (!signatureOk(parsed.sig!, parsed.ts!)) throw new BadRequest('Invalid signature')
}


validateStores(parsed)
const { owner, entityTypeId } = resolveOwner(parsed)


const b24 = new BitrixClient(process.env.B24_WEBHOOK_URL)


// 1) Получаем товарные строки
const rows = owner === 'deal'
? await b24.getDealProductRows(parsed.elemId)
: await b24.getSpaProductRows(entityTypeId!, parsed.elemId)


if (!rows.length) throw new NotFound('No product rows for element')


// 2) Готовим документ инвентаризации
const payload = buildDocumentFromRows({
docType: parsed.docType as DocType,
}