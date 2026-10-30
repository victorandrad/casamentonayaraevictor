import type { FastifyInstance, FastifyReply } from 'fastify';
import type { FotosConvidados, MidiaEnviada } from '@nv/shared/types';
import { rateLimiter } from '../auth.ts';
import {
  concluirEnvio,
  EnvioNaoEncontrado,
  envioAberto,
  excluirFotoConvidado,
  iniciarEnvio,
  listarFotosConvidados,
  MAX_VIDEO_BYTES,
  MidiaInvalida,
  ParteForaDeOrdem,
  receberParte,
  TAMANHO_PARTE,
} from '../fotosConvidados.ts';

// Generous: at the party many phones share the venue's Wi-Fi (one IP for everybody).
const envioLimiter = rateLimiter(400, 60 * 60_000);

const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
// Random token kept on the guest's phone: lets them delete what they sent.
const AUTOR = '^[A-Za-z0-9_-]{32,64}$';
const envioParams = {
  type: 'object',
  required: ['envio'],
  properties: { envio: { type: 'string', pattern: '^[a-f0-9]{32}$' } },
} as const;

async function tratarErros<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof MidiaInvalida) return reply.code(400).send({ erro: error.message });
    if (error instanceof EnvioNaoEncontrado) return reply.code(404).send({ erro: 'O envio expirou. Tente de novo.' });
    if (error instanceof ParteForaDeOrdem) return reply.code(409).send({ erro: error.message, recebido: error.recebido });
    throw error;
  }
}

export async function fotosConvidadosRoutes(app: FastifyInstance) {
  // The parts of a file come as raw bytes.
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: TAMANHO_PARTE }, (_req, corpo, feito) => feito(null, corpo));

  app.get<{ Querystring: { depois?: string } }>(
    '/fotos-convidados',
    { schema: { querystring: { type: 'object', additionalProperties: false, properties: { depois: { type: 'string', pattern: UUID } } } } },
    async (req): Promise<FotosConvidados> => listarFotosConvidados(req.query.depois ?? null),
  );

  app.post<{ Body: { tipo: 'foto' | 'video'; tamanho: number; nome: string; autor: string } }>(
    '/fotos-convidados/envios',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tipo', 'tamanho', 'nome', 'autor'],
          additionalProperties: false,
          properties: {
            tipo: { enum: ['foto', 'video'] },
            tamanho: { type: 'integer', minimum: 1, maximum: MAX_VIDEO_BYTES },
            nome: { type: 'string', maxLength: 60 },
            autor: { type: 'string', pattern: AUTOR },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await envioAberto()).aberto) return reply.code(403).send({ erro: 'O envio de fotos não está aberto agora.' });
      if (envioLimiter.hit(req.ip)) return reply.code(429).send({ erro: 'Muitos envios seguidos. Tente novamente mais tarde.' });
      return tratarErros(reply, async () => reply.code(201).send({ envio: await iniciarEnvio(req.body, req.ip), parte: TAMANHO_PARTE }));
    },
  );

  app.put<{ Params: { envio: string }; Querystring: { inicio: number }; Body: Buffer }>(
    '/fotos-convidados/envios/:envio',
    {
      bodyLimit: TAMANHO_PARTE,
      schema: {
        params: envioParams,
        querystring: { type: 'object', required: ['inicio'], properties: { inicio: { type: 'integer', minimum: 0 } } },
      },
    },
    async (req, reply) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) return reply.code(400).send({ erro: 'Parte vazia.' });
      const corpo = req.body;
      return tratarErros(reply, async () => ({ recebido: await receberParte(req.params.envio, req.query.inicio, corpo) }));
    },
  );

  app.post<{ Params: { envio: string } }>('/fotos-convidados/envios/:envio/concluir', { schema: { params: envioParams } }, async (req, reply) =>
    tratarErros(reply, async (): Promise<MidiaEnviada> => reply.code(201).send(await concluirEnvio(req.params.envio))),
  );

  app.delete<{ Params: { uid: string } }>(
    '/fotos-convidados/:uid',
    { schema: { params: { type: 'object', required: ['uid'], properties: { uid: { type: 'string', pattern: UUID } } } } },
    async (req, reply) => {
      const autor = req.headers['x-autor'];
      if (typeof autor !== 'string' || !new RegExp(AUTOR).test(autor)) return reply.code(403).send({ erro: 'Só quem enviou pode excluir.' });
      return (await excluirFotoConvidado({ uid: req.params.uid, autor }))
        ? reply.code(204).send()
        : reply.code(404).send({ erro: 'Foto não encontrada.' });
    },
  );
}
