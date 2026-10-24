import type { FastifyInstance } from 'fastify';
import type { ListaPresentes, RecadoInput, RespostaInput } from '@nv/shared/types';
import { rateLimiter } from '../auth.ts';
import * as repo from '../repo.ts';

const codigoParams = {
  type: 'object',
  required: ['codigo'],
  properties: { codigo: { type: 'string', minLength: 3, maxLength: 20 } },
} as const;

const recadosLimiter = rateLimiter(5, 60 * 60_000);

export async function publicRoutes(app: FastifyInstance) {
  app.get<{ Params: { codigo: string } }>('/convites/:codigo', { schema: { params: codigoParams } }, async (req, reply) => {
    const convite = await repo.findConvite(req.params.codigo);
    if (!convite) return reply.code(404).send({ erro: 'Código não encontrado. Confira com os noivos.' });
    const { id: _id, ...publico } = convite;
    return publico;
  });

  app.put<{ Params: { codigo: string }; Body: RespostaInput }>(
    '/convites/:codigo/resposta',
    {
      schema: {
        params: codigoParams,
        body: {
          type: 'object',
          required: ['status', 'acompanhantes', 'mensagem'],
          additionalProperties: false,
          properties: {
            status: { enum: ['sim', 'nao'] },
            acompanhantes: { type: 'integer', minimum: 0, maximum: 10 },
            mensagem: { type: 'string', maxLength: 600 },
          },
        },
      },
    },
    async (req, reply) => {
      const convite = await repo.findConvite(req.params.codigo);
      if (!convite) return reply.code(404).send({ erro: 'Código não encontrado. Confira com os noivos.' });
      if (req.body.acompanhantes > convite.limiteAcompanhantes) {
        return reply.code(400).send({ erro: `Este convite permite até ${convite.limiteAcompanhantes} acompanhante(s).` });
      }
      await repo.saveResposta(convite.id, { ...req.body, mensagem: req.body.mensagem.trim() });
      const { id: _id, ...publico } = (await repo.findConvite(convite.codigo))!;
      return publico;
    },
  );

  app.get<{ Params: { codigo: string } }>('/checkin/:codigo', { schema: { params: codigoParams } }, async (req, reply) => {
    const checkin = await repo.findCheckin(req.params.codigo);
    if (!checkin) return reply.code(404).send({ erro: 'Convite não encontrado.' });
    return checkin;
  });

  app.get('/recados', async () => repo.listRecadosPublicos());

  app.post<{ Body: RecadoInput }>(
    '/recados',
    {
      schema: {
        body: {
          type: 'object',
          required: ['nome', 'mensagem'],
          additionalProperties: false,
          properties: {
            nome: { type: 'string', minLength: 1, maxLength: 80 },
            mensagem: { type: 'string', minLength: 1, maxLength: 600 },
          },
        },
      },
    },
    async (req, reply) => {
      const nome = req.body.nome.trim();
      const mensagem = req.body.mensagem.trim();
      if (!nome || !mensagem) return reply.code(400).send({ erro: 'Preencha seu nome e o recado.' });
      if (recadosLimiter.hit(req.ip)) {
        return reply.code(429).send({ erro: 'Muitos recados seguidos. Tente novamente mais tarde.' });
      }
      return reply.code(201).send(await repo.createRecado(nome, mensagem));
    },
  );

  app.get('/galeria', async () => repo.listFotos());

  app.get('/presentes', async (): Promise<ListaPresentes> => ({
    categorias: await repo.listCategorias(),
    presentes: await repo.listPresentes(),
    taxa: await repo.getTaxa(),
  }));
}
