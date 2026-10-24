import { config } from '../config.ts';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { ICONES_CATEGORIA } from '@nv/shared/categorias';
import { IDS_MOMENTOS } from '@nv/shared/galeria';
import type { CategoriaInput, Configuracoes, ConvidadoInput, FotoGaleriaInput, OrganizacaoLista, PresenteInput } from '@nv/shared/types';
import { destroyOtherSessions, requireAuth, requireOwner, SESSION_COOKIE } from '../auth.ts';
import * as repo from '../repo.ts';
import { enviarReciboDoPedido, listarPedidos } from '../pedidos.ts';
import { ImagemInvalida, LADO_GALERIA, LADO_PRESENTE, removerImagem, salvarImagem, TIPOS_ACEITOS } from '../uploads.ts';
import * as emails from '../emails.ts';
import * as usuarios from '../usuarios.ts';

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

// Gifts and orders are addressed by their public UUID (migration 012), never by the sequential id.
const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const uidParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: UUID } },
} as const;

const convidadoBody = {
  type: 'object',
  required: ['nome', 'limiteAcompanhantes'],
  additionalProperties: false,
  properties: {
    nome: { type: 'string', minLength: 1, maxLength: 120 },
    limiteAcompanhantes: { type: 'integer', minimum: 0, maximum: 10 },
  },
} as const;

const presenteBody = {
  type: 'object',
  required: ['categoriaId', 'nome', 'valorCentavos', 'quantidadeMaxima'],
  additionalProperties: false,
  properties: {
    categoriaId: { type: 'integer', minimum: 1 },
    nome: { type: 'string', minLength: 1, maxLength: 120 },
    valorCentavos: { type: 'integer', minimum: 0, maximum: 100_000_000 },
    // An uploaded photo (/api/uploads/<hex>.webp) or an external https link
    fotoUrl: { type: ['string', 'null'], maxLength: 1000, pattern: '^(https?://.*|/api/uploads/[a-f0-9]{32}\\.webp)?$' },
    quantidadeMaxima: { type: ['integer', 'null'], minimum: 1, maximum: 1000 },
  },
} as const;

const fotoGaleriaBody = {
  type: 'object',
  required: ['url', 'legenda', 'momento'],
  additionalProperties: false,
  properties: {
    // Only photos uploaded here (/api/uploads/<hex>.webp)
    url: { type: 'string', pattern: '^/api/uploads/[a-f0-9]{32}\\.webp$' },
    legenda: { type: 'string', maxLength: 140 },
    momento: { enum: IDS_MOMENTOS },
  },
} as const;

const categoriaBody = {
  type: 'object',
  required: ['nome', 'icone'],
  additionalProperties: false,
  properties: {
    nome: { type: 'string', minLength: 1, maxLength: 60 },
    icone: { enum: [...ICONES_CATEGORIA] },
  },
} as const;

const enderecoParams = {
  type: 'object',
  required: ['endereco'],
  properties: { endereco: { type: 'string', minLength: 3, maxLength: 254 } },
} as const;

const senhaBody = {
  type: 'object',
  required: ['senha'],
  additionalProperties: false,
  properties: { senha: { type: 'string', minLength: emails.SENHA_MINIMA, maxLength: 200 } },
} as const;

const destinosSchema = { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', maxLength: 254 } } as const;

const notFound = { erro: 'Item não encontrado.' };

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  // E-mails and changing the settings are for the master only (the settings stay readable: the gift
  // list shows the fee from them).
  app.addHook('preHandler', async (req, reply) => {
    const rota = req.routeOptions.url ?? '';
    if (rota.startsWith('/api/admin/emails') || (rota === '/api/admin/configuracoes' && req.method !== 'GET')) {
      return requireOwner(req, reply);
    }
  });

  app.get('/resumo', async () => repo.resumo());

  // Minha conta (qualquer usuário) e usuários do painel (só o dono)
  const comErroDeUsuario = async (reply: FastifyReply, fn: () => Promise<unknown>) => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof usuarios.ErroUsuario) return reply.code(error.status).send({ erro: error.message });
      throw error;
    }
  };

  app.put<{ Body: { nome: string } }>(
    '/conta/nome',
    {
      schema: {
        body: { type: 'object', required: ['nome'], additionalProperties: false, properties: { nome: { type: 'string', minLength: 1, maxLength: 80 } } },
      },
    },
    async (req, reply) => comErroDeUsuario(reply, async () => ({ nome: await usuarios.trocarNome(req.usuario!.id, req.body.nome) })),
  );

  app.put<{ Body: { senhaAtual: string; senhaNova: string } }>(
    '/conta/senha',
    {
      schema: {
        body: {
          type: 'object',
          required: ['senhaAtual', 'senhaNova'],
          additionalProperties: false,
          properties: {
            senhaAtual: { type: 'string', minLength: 1, maxLength: 200 },
            senhaNova: { type: 'string', minLength: usuarios.SENHA_MINIMA, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) =>
      comErroDeUsuario(reply, async () => {
        const resultado = await usuarios.trocarSenha(req.usuario!, req.body.senhaAtual, req.body.senhaNova);
        await destroyOtherSessions(req.usuario!.id, req.cookies[SESSION_COOKIE]);
        return resultado;
      }),
  );

  app.get('/usuarios', { preHandler: requireOwner }, async () => usuarios.listar());

  app.post<{ Body: { email: string; nome: string } }>(
    '/usuarios',
    {
      preHandler: requireOwner,
      schema: {
        body: {
          type: 'object',
          required: ['email', 'nome'],
          additionalProperties: false,
          properties: { email: { type: 'string', minLength: 3, maxLength: 200 }, nome: { type: 'string', minLength: 1, maxLength: 80 } },
        },
      },
    },
    async (req, reply) =>
      comErroDeUsuario(reply, async () => reply.code(201).send(await usuarios.convidar(req.body.email, req.body.nome, req.usuario!.nome))),
  );

  app.post<{ Params: { id: number } }>(
    '/usuarios/:id/convite',
    { preHandler: requireOwner, schema: { params: idParams } },
    async (req, reply) => comErroDeUsuario(reply, async () => usuarios.reenviarConvite(req.params.id, req.usuario!.nome)),
  );

  app.delete<{ Params: { id: number } }>(
    '/usuarios/:id',
    { preHandler: requireOwner, schema: { params: idParams } },
    async (req, reply) =>
      comErroDeUsuario(reply, async () => {
        await usuarios.remover(req.params.id, req.usuario!);
        return reply.code(204).send();
      }),
  );

  // Convidados
  app.get('/convidados', async () => repo.listConvidados());

  app.post<{ Body: ConvidadoInput }>('/convidados', { schema: { body: convidadoBody } }, async (req, reply) => {
    const nome = req.body.nome.trim();
    if (!nome) return reply.code(400).send({ erro: 'Informe o nome do convidado.' });
    return reply.code(201).send(await repo.createConvidado({ ...req.body, nome }));
  });

  app.put<{ Params: { id: number }; Body: ConvidadoInput }>(
    '/convidados/:id',
    { schema: { params: idParams, body: convidadoBody } },
    async (req, reply) => {
      const nome = req.body.nome.trim();
      if (!nome) return reply.code(400).send({ erro: 'Informe o nome do convidado.' });
      return (await repo.updateConvidado(req.params.id, { ...req.body, nome })) ?? reply.code(404).send(notFound);
    },
  );

  app.delete<{ Params: { id: number } }>('/convidados/:id', { schema: { params: idParams } }, async (req, reply) =>
    (await repo.deleteConvidado(req.params.id)) ? reply.code(204).send() : reply.code(404).send(notFound),
  );

  // Recados
  app.get('/recados', async () => repo.listRecadosAdmin());

  app.patch<{ Params: { id: number }; Body: { visivel: boolean } }>(
    '/recados/:id',
    {
      schema: {
        params: idParams,
        body: { type: 'object', required: ['visivel'], additionalProperties: false, properties: { visivel: { type: 'boolean' } } },
      },
    },
    async (req, reply) => (await repo.setRecadoVisivel(req.params.id, req.body.visivel)) ?? reply.code(404).send(notFound),
  );

  app.delete<{ Params: { id: number } }>('/recados/:id', { schema: { params: idParams } }, async (req, reply) =>
    (await repo.deleteRecado(req.params.id)) ? reply.code(204).send() : reply.code(404).send(notFound),
  );

  // Photo upload (multipart, field "foto"). ?tipo=galeria keeps a larger image for the full-screen viewer.
  app.post<{ Querystring: { tipo?: 'presente' | 'galeria' } }>(
    '/uploads',
    { schema: { querystring: { type: 'object', properties: { tipo: { enum: ['presente', 'galeria'] } } } } },
    async (req, reply) => {
    const arquivo = await req.file();
    if (!arquivo) return reply.code(400).send({ erro: 'Escolha uma imagem para enviar.' });
    if (!TIPOS_ACEITOS.includes(arquivo.mimetype)) {
      return reply.code(400).send({ erro: 'Formato não aceito. Envie JPG, PNG, WebP ou HEIC.' });
    }
    let conteudo: Buffer;
    try {
      conteudo = await arquivo.toBuffer();
    } catch {
      return reply.code(413).send({ erro: 'A imagem é muito grande. O limite é 10 MB.' });
    }
    try {
      return reply.code(201).send({ url: await salvarImagem(conteudo, req.query.tipo === 'galeria' ? LADO_GALERIA : LADO_PRESENTE) });
    } catch (error) {
      if (error instanceof ImagemInvalida) return reply.code(400).send({ erro: error.message });
      throw error;
    }
    },
  );

  // Galeria de fotos do site
  app.get('/galeria', async () => repo.listFotos());

  app.post<{ Body: FotoGaleriaInput }>('/galeria', { schema: { body: fotoGaleriaBody } }, async (req, reply) =>
    reply.code(201).send(await repo.createFoto({ ...req.body, legenda: req.body.legenda.trim() })),
  );

  // Before /galeria/:id so "ordem" is not read as an id.
  app.put<{ Body: { ids: number[] } }>(
    '/galeria/ordem',
    {
      schema: {
        body: {
          type: 'object',
          required: ['ids'],
          additionalProperties: false,
          properties: { ids: { type: 'array', maxItems: 2000, uniqueItems: true, items: { type: 'integer', minimum: 1 } } },
        },
      },
    },
    async (req) => repo.ordenarFotos(req.body.ids),
  );

  app.put<{ Params: { id: number }; Body: FotoGaleriaInput }>(
    '/galeria/:id',
    { schema: { params: idParams, body: fotoGaleriaBody } },
    async (req, reply) => {
      const resultado = await repo.updateFoto(req.params.id, { ...req.body, legenda: req.body.legenda.trim() });
      if (!resultado) return reply.code(404).send(notFound);
      if (resultado.urlAnterior !== resultado.foto.url) await removerImagem(resultado.urlAnterior);
      return resultado.foto;
    },
  );

  app.delete<{ Params: { id: number } }>('/galeria/:id', { schema: { params: idParams } }, async (req, reply) => {
    const url = await repo.deleteFoto(req.params.id);
    if (url === null) return reply.code(404).send(notFound);
    await removerImagem(url);
    return reply.code(204).send();
  });

  // Categorias da lista de presentes
  app.get('/categorias', async () => repo.listCategorias());

  const salvarCategoria = async (reply: FastifyReply, fn: () => Promise<unknown>) => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof repo.NomeDuplicado) return reply.code(409).send({ erro: error.message });
      throw error;
    }
  };

  app.post<{ Body: CategoriaInput }>('/categorias', { schema: { body: categoriaBody } }, async (req, reply) => {
    const nome = req.body.nome.trim();
    if (!nome) return reply.code(400).send({ erro: 'Informe o nome da categoria.' });
    return salvarCategoria(reply, async () => reply.code(201).send(await repo.createCategoria({ ...req.body, nome })));
  });

  app.put<{ Params: { id: number }; Body: CategoriaInput }>(
    '/categorias/:id',
    { schema: { params: idParams, body: categoriaBody } },
    async (req, reply) => {
      const nome = req.body.nome.trim();
      if (!nome) return reply.code(400).send({ erro: 'Informe o nome da categoria.' });
      return salvarCategoria(
        reply,
        async () => (await repo.updateCategoria(req.params.id, { ...req.body, nome })) ?? reply.code(404).send(notFound),
      );
    },
  );

  app.put<{ Body: { ids: number[] } }>(
    '/categorias/ordem',
    {
      schema: {
        body: {
          type: 'object',
          required: ['ids'],
          additionalProperties: false,
          properties: { ids: { type: 'array', maxItems: 200, uniqueItems: true, items: { type: 'integer', minimum: 1 } } },
        },
      },
    },
    async (req) => repo.ordenarCategorias(req.body.ids),
  );

  // Drag-and-drop layout of the whole list (category order + gifts in each).
  app.put<{ Body: { categorias: OrganizacaoLista } }>(
    '/presentes/organizacao',
    {
      schema: {
        body: {
          type: 'object',
          required: ['categorias'],
          additionalProperties: false,
          properties: {
            categorias: {
              type: 'array',
              maxItems: 200,
              items: {
                type: 'object',
                required: ['id', 'presentes'],
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', minimum: 1 },
                  presentes: { type: 'array', maxItems: 2000, items: { type: 'string', pattern: UUID } },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const { categorias } = req.body;
      const presentes = categorias.flatMap((c) => c.presentes);
      if (new Set(categorias.map((c) => c.id)).size !== categorias.length || new Set(presentes).size !== presentes.length) {
        return reply.code(400).send({ erro: 'Organização inválida.' });
      }
      if (!(await repo.organizarLista(categorias))) {
        return reply.code(409).send({ erro: 'A lista mudou enquanto vocês organizavam. Recarregue a página.' });
      }
      return { categorias: await repo.listCategorias(), presentes: await repo.listPresentes() };
    },
  );

  // ?moverPara=<id> moves the category's gifts there before deleting it.
  app.delete<{ Params: { id: number }; Querystring: { moverPara?: number } }>(
    '/categorias/:id',
    {
      schema: {
        params: idParams,
        querystring: { type: 'object', additionalProperties: false, properties: { moverPara: { type: 'integer', minimum: 1 } } },
      },
    },
    async (req, reply) => {
      const resultado = await repo.deleteCategoria(req.params.id, req.query.moverPara);
      if (resultado === 'nao_encontrada') return reply.code(404).send(notFound);
      if (resultado === 'tem_presentes') return reply.code(409).send({ erro: 'Escolha para qual categoria mover os presentes desta.' });
      if (resultado === 'destino_invalido') return reply.code(400).send({ erro: 'Categoria de destino inválida.' });
      return reply.code(204).send();
    },
  );

  // Presentes
  app.get('/presentes', async () => repo.listPresentes());

  const categoriaInvalida = { erro: 'Escolha uma categoria válida.' };

  app.post<{ Body: PresenteInput }>('/presentes', { schema: { body: presenteBody } }, async (req, reply) => {
    const nome = req.body.nome.trim();
    if (!nome) return reply.code(400).send({ erro: 'Informe o nome do presente.' });
    if (!(await repo.categoriaExiste(req.body.categoriaId))) return reply.code(400).send(categoriaInvalida);
    return reply.code(201).send(
      await repo.createPresente({ ...req.body, nome, fotoUrl: req.body.fotoUrl ?? null, quantidadeMaxima: req.body.quantidadeMaxima ?? null }),
    );
  });

  app.put<{ Params: { id: string }; Body: PresenteInput }>(
    '/presentes/:id',
    { schema: { params: uidParams, body: presenteBody } },
    async (req, reply) => {
      const nome = req.body.nome.trim();
      if (!nome) return reply.code(400).send({ erro: 'Informe o nome do presente.' });
      if (!(await repo.categoriaExiste(req.body.categoriaId))) return reply.code(400).send(categoriaInvalida);
      const anterior = (await repo.listPresentes()).find((p) => p.id === req.params.id);
      const atualizado = await repo.updatePresente(req.params.id, {
        ...req.body,
        nome,
        fotoUrl: req.body.fotoUrl ?? null,
        quantidadeMaxima: req.body.quantidadeMaxima ?? null,
      });
      if (!atualizado) return reply.code(404).send(notFound);
      if (anterior?.fotoUrl !== atualizado.fotoUrl) await removerImagem(anterior?.fotoUrl);
      return atualizado;
    },
  );

  app.delete<{ Params: { id: string } }>('/presentes/:id', { schema: { params: uidParams } }, async (req, reply) => {
    const anterior = (await repo.listPresentes()).find((p) => p.id === req.params.id);
    if (!(await repo.deletePresente(req.params.id))) return reply.code(404).send(notFound);
    await removerImagem(anterior?.fotoUrl);
    return reply.code(204).send();
  });

  // E-mails do domínio (caixas e apelidos do servidor de e-mail próprio)
  const comErroDeEmail = async (reply: FastifyReply, fn: () => Promise<unknown>) => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof emails.ErroEmail) return reply.code(error.status).send({ erro: error.message });
      throw error;
    }
  };

  app.get('/emails', async () => emails.listar());

  app.post<{ Body: { usuario: string; senha: string } }>(
    '/emails/caixas',
    {
      schema: {
        body: {
          type: 'object',
          required: ['usuario', 'senha'],
          additionalProperties: false,
          properties: { usuario: { type: 'string', minLength: 1, maxLength: 254 }, senha: senhaBody.properties.senha },
        },
      },
    },
    async (req, reply) =>
      comErroDeEmail(reply, async () => reply.code(201).send(await emails.criarCaixa(req.body.usuario, req.body.senha))),
  );

  app.put<{ Params: { endereco: string }; Body: { senha: string } }>(
    '/emails/caixas/:endereco/senha',
    { schema: { params: enderecoParams, body: senhaBody } },
    async (req, reply) =>
      comErroDeEmail(reply, async () => {
        await emails.trocarSenha(req.params.endereco, req.body.senha);
        return reply.code(204).send();
      }),
  );

  app.delete<{ Params: { endereco: string } }>(
    '/emails/caixas/:endereco',
    { schema: { params: enderecoParams } },
    async (req, reply) =>
      comErroDeEmail(reply, async () => {
        await emails.excluirCaixa(req.params.endereco);
        return reply.code(204).send();
      }),
  );

  app.post<{ Body: { usuario: string; destinos: string[] } }>(
    '/emails/apelidos',
    {
      schema: {
        body: {
          type: 'object',
          required: ['usuario', 'destinos'],
          additionalProperties: false,
          properties: { usuario: { type: 'string', minLength: 1, maxLength: 254 }, destinos: destinosSchema },
        },
      },
    },
    async (req, reply) =>
      comErroDeEmail(reply, async () =>
        reply.code(201).send(await emails.salvarApelido(req.body.usuario, req.body.destinos, true)),
      ),
  );

  app.put<{ Params: { endereco: string }; Body: { destinos: string[] } }>(
    '/emails/apelidos/:endereco',
    {
      schema: {
        params: enderecoParams,
        body: { type: 'object', required: ['destinos'], additionalProperties: false, properties: { destinos: destinosSchema } },
      },
    },
    async (req, reply) =>
      comErroDeEmail(reply, async () => emails.salvarApelido(req.params.endereco, req.body.destinos, false)),
  );

  app.delete<{ Params: { endereco: string } }>(
    '/emails/apelidos/:endereco',
    { schema: { params: enderecoParams } },
    async (req, reply) =>
      comErroDeEmail(reply, async () => {
        await emails.excluirApelido(req.params.endereco);
        return reply.code(204).send();
      }),
  );

  // Presentes recebidos (pedidos do Stripe)
  app.get('/pedidos', async () => listarPedidos());

  app.post<{ Params: { id: string } }>('/pedidos/:id/recibo', { schema: { params: uidParams } }, async (req, reply) =>
    (await enviarReciboDoPedido(req.params.id, { reenviar: true }))
      ? { enviado: true }
      : reply.code(400).send({ erro: 'Não foi possível enviar o recibo. Confira se o pedido está pago e o servidor de e-mail.' }),
  );

  // Configurações
  const lerConfiguracoes = async (): Promise<Configuracoes> => ({
    taxa: await repo.getTaxa(),
    gateway: config.gateway,
  });
  app.get('/configuracoes', lerConfiguracoes);

  app.put<{ Body: Pick<Configuracoes, 'taxa'> }>(
    '/configuracoes',
    {
      schema: {
        body: {
          type: 'object',
          required: ['taxa'],
          additionalProperties: false,
          properties: {
            taxa: {
              type: 'object',
              required: ['percentual', 'fixoCentavos'],
              additionalProperties: false,
              properties: {
                percentual: { type: 'number', minimum: 0, maximum: 20 },
                fixoCentavos: { type: 'integer', minimum: 0, maximum: 1000 },
              },
            },
          },
        },
      },
    },
    async (req): Promise<Configuracoes> => {
      await repo.setTaxa(req.body.taxa);
      return lerConfiguracoes();
    },
  );
}
