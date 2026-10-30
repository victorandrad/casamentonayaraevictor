import type { FastifyInstance, FastifyReply } from 'fastify';
import { ICONES_CATEGORIA } from '@nv/shared/categorias';
import { IDS_MOMENTOS } from '@nv/shared/galeria';
import type { AplicacaoMercadoPagoInput, CategoriaInput, CredenciaisMercadoPagoInput, Configuracoes, ConvidadoInput, FotoGaleriaInput, OrganizacaoLista, PresenteInput } from '@nv/shared/types';
import { destroyOtherSessions, requireAuth, requireOwner, SESSION_COOKIE } from '../auth.ts';
import * as repo from '../repo.ts';
import { enviarReciboDoPedido, listarPedidos } from '../pedidos.ts';
import * as mercadoPagoConta from '../mercadopagoConta.ts';
import { ultimoErroMercadoPago } from '../mercadopago.ts';
import { avisosCsp } from './csp.ts';
import { fotoEmJpeg, ImagemInvalida, LADO_GALERIA, LADO_PRESENTE, removerImagem, salvarImagem, TIPOS_ACEITOS } from '../uploads.ts';
import { gerarZip } from '../zip.ts';
import { rotuloMomento } from '@nv/shared/galeria';
import { Readable } from 'node:stream';
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

const notFound = { erro: 'Item não encontrado.' };

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  // Changing the settings and the Mercado Pago account are for the master only (the settings stay
  // readable: the gift list shows the fee from them).
  app.addHook('preHandler', async (req, reply) => {
    const rota = req.routeOptions.url ?? '';
    if (
      (rota === '/api/admin/configuracoes' && req.method !== 'GET') ||
      rota.startsWith('/api/admin/mercadopago') ||
      rota.startsWith('/api/admin/seguranca')
    ) {
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
        await usuarios.trocarSenha(req.usuario!, req.body.senhaAtual, req.body.senhaNova);
        await destroyOtherSessions(req.usuario!.id, req.cookies[SESSION_COOKIE]);
        return reply.code(204).send();
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

  // Downloading the album: one photo, or all of them in a .zip, as JPG with readable names in album
  // order (e.g. "03-cerimonia-entrada-da-noiva.jpg"). Photos linked from elsewhere are left out.
  const nomesDasFotos = (fotos: Array<{ id: number; legenda: string; momento: string }>) => {
    const slug = (texto: string) =>
      texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
    const largura = String(fotos.length).length < 2 ? 2 : String(fotos.length).length;
    return new Map(
      fotos.map((f, i) => [
        f.id,
        `${String(i + 1).padStart(largura, '0')}-${[slug(rotuloMomento(f.momento)), slug(f.legenda)].filter(Boolean).join('-')}.jpg`,
      ]),
    );
  };

  app.get('/galeria/fotos.zip', async (req, reply) => {
    const fotos = await repo.listFotos();
    const nomes = nomesDasFotos(fotos);
    // Each photo is converted only when its turn comes in the stream.
    const arquivos = fotos.map((f) => ({ nome: nomes.get(f.id)!, dados: () => fotoEmJpeg(f.url) }));
    req.log.info({ fotos: fotos.length }, 'álbum baixado');
    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', 'attachment; filename="album-nayara-e-victor.zip"')
      .send(Readable.from(gerarZip(arquivos)));
  });

  app.get<{ Params: { id: number } }>('/galeria/:id/download', { schema: { params: idParams } }, async (req, reply) => {
    const fotos = await repo.listFotos();
    const foto = fotos.find((f) => f.id === req.params.id);
    if (!foto) return reply.code(404).send(notFound);
    const jpeg = await fotoEmJpeg(foto.url);
    if (!jpeg) return reply.code(404).send({ erro: 'Esta foto não está guardada no site (é um link externo).' });
    const nome = nomesDasFotos(fotos).get(foto.id)!;
    return reply
      .header('Content-Type', 'image/jpeg')
      .header('Content-Disposition', `attachment; filename="${nome}"`)
      .send(jpeg);
  });

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

  // Gift given outside the site: how many units (0 undoes it).
  app.put<{ Params: { id: string }; Body: { quantidade: number } }>(
    '/presentes/:id/fora-do-site',
    {
      schema: {
        params: uidParams,
        body: {
          type: 'object',
          required: ['quantidade'],
          additionalProperties: false,
          properties: { quantidade: { type: 'integer', minimum: 0, maximum: 1000 } },
        },
      },
    },
    async (req, reply) => {
      const resultado = await repo.setPresenteadosFora(req.params.id, req.body.quantidade);
      if (!resultado) return reply.code(404).send(notFound);
      if (resultado === 'excede') {
        return reply.code(400).send({ erro: 'Essa quantidade passa do limite do presente, contando o que já foi pago pelo site.' });
      }
      return resultado;
    },
  );

  app.delete<{ Params: { id: string } }>('/presentes/:id', { schema: { params: uidParams } }, async (req, reply) => {
    const anterior = (await repo.listPresentes()).find((p) => p.id === req.params.id);
    if (!(await repo.deletePresente(req.params.id))) return reply.code(404).send(notFound);
    await removerImagem(anterior?.fotoUrl);
    return reply.code(204).send();
  });

  // Presentes recebidos (pedidos pagos)
  app.get('/pedidos', async () => listarPedidos());

  app.post<{ Params: { id: string } }>('/pedidos/:id/recibo', { schema: { params: uidParams } }, async (req, reply) =>
    (await enviarReciboDoPedido(req.params.id, { reenviar: true }))
      ? { enviado: true }
      : reply.code(400).send({ erro: 'Não foi possível enviar o recibo. Confira se o pedido está pago e o servidor de e-mail.' }),
  );

  // Configurações
  const lerConfiguracoes = async (): Promise<Configuracoes> => ({
    taxa: await repo.getTaxa(),
  });
  app.get('/configuracoes', lerConfiguracoes);

  app.put<{ Body: Configuracoes }>(
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

  // Mercado Pago: "Conectar ao Mercado Pago" sends the couple to authorize the application, and
  // Mercado Pago brings them back to /retorno, which goes on to the panel with the result.
  // What the site's Content Security Policy blocked (or would block), for the couple to review.
  app.get('/seguranca/csp', async () => avisosCsp());

  app.get('/mercadopago', async () => ({ ...(await mercadoPagoConta.situacao()), ultimoErro: ultimoErroMercadoPago() }));

  app.put<{ Body: AplicacaoMercadoPagoInput }>(
    '/mercadopago/aplicacao',
    {
      schema: {
        body: {
          type: 'object',
          required: ['clientId', 'clientSecret'],
          additionalProperties: false,
          properties: {
            clientId: { type: 'string', pattern: '^[0-9]{6,30}$' },
            clientSecret: { type: 'string', minLength: 16, maxLength: 200, pattern: '^\\S+$' },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        await mercadoPagoConta.salvarAplicacao(req.body.clientId, req.body.clientSecret, req.usuario!.id);
      } catch (error) {
        if (error instanceof mercadoPagoConta.ErroConexao) return reply.code(400).send({ erro: error.message });
        req.log.error(error, 'falha ao conferir a aplicação do Mercado Pago');
        return reply.code(502).send({ erro: 'Não foi possível falar com o Mercado Pago agora. Tente de novo em instantes.' });
      }
      req.log.info('aplicação do Mercado Pago cadastrada');
      return mercadoPagoConta.situacao();
    },
  );

  app.put<{ Body: CredenciaisMercadoPagoInput }>(
    '/mercadopago/credenciais',
    {
      schema: {
        body: {
          type: 'object',
          required: ['publicKey', 'accessToken', 'producao'],
          additionalProperties: false,
          properties: {
            publicKey: { type: 'string', pattern: '^(APP_USR|TEST)-[0-9a-fA-F-]{20,80}$' },
            accessToken: { type: 'string', pattern: '^(APP_USR|TEST)-[0-9A-Za-z-]{20,200}$' },
            producao: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        await mercadoPagoConta.salvarCredenciais(req.body.publicKey, req.body.accessToken, req.body.producao, req.usuario!.id);
      } catch (error) {
        if (error instanceof mercadoPagoConta.ErroConexao) return reply.code(400).send({ erro: error.message });
        req.log.error(error, 'falha ao conferir as credenciais do Mercado Pago');
        return reply.code(502).send({ erro: 'Não foi possível falar com o Mercado Pago agora. Tente de novo em instantes.' });
      }
      req.log.info('conta do Mercado Pago ligada por credenciais');
      return mercadoPagoConta.situacao();
    },
  );

  app.post('/mercadopago/conectar', async (req, reply) => {
    try {
      return { url: await mercadoPagoConta.iniciarConexao(req.usuario!.id) };
    } catch (error) {
      if (error instanceof mercadoPagoConta.ErroConexao) return reply.code(400).send({ erro: error.message });
      throw error;
    }
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/mercadopago/retorno', async (req, reply) => {
    const voltar = (resultado: string) => reply.redirect(`/painel?mercadopago=${resultado}`);
    const { code, state } = req.query;
    // Declined on Mercado Pago's page (or came back without a code).
    if (!code || !state) return voltar('cancelado');
    try {
      await mercadoPagoConta.concluirConexao(req.usuario!.id, state, code);
      req.log.info('conta do Mercado Pago conectada');
      return voltar('conectado');
    } catch (error) {
      req.log.warn({ err: (error as Error).message }, 'falha ao conectar a conta do Mercado Pago');
      return voltar('erro');
    }
  });

  app.delete('/mercadopago', async (req, reply) => {
    await mercadoPagoConta.desconectar();
    req.log.info('conta do Mercado Pago desconectada');
    return reply.code(204).send();
  });

  app.delete('/mercadopago/aplicacao', async (req) => {
    await mercadoPagoConta.removerAplicacao();
    req.log.info('aplicação do Mercado Pago removida');
    return mercadoPagoConta.situacao();
  });
}
