// Outgoing e-mail over SMTP: the local Mailpit server in development, the
// couple's own mail server (or any SMTP) in production.
import nodemailer from 'nodemailer';
import { casamento } from '@nv/shared/config';
import { config } from './config.ts';

const transporte = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
});

export type EmailRecibo = {
  numero: string;
  nome: string;
  email: string;
  mensagem: string;
  itens: Array<{ nome: string; quantidade: number; valorCentavos: number }>;
  totalCentavos: number;
  formaPagamento: string | null;
  pagoEm: Date;
};

const brl = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const nomesForma: Record<string, string> = { card: 'Cartão', pix: 'Pix', link: 'Link' };

export async function enviarRecibo(r: EmailRecibo) {
  const casal = `${casamento.noiva} & ${casamento.noivo}`;
  const primeiroNome = r.nome.split(' ')[0];
  const data = r.pagoEm.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
  const forma = r.formaPagamento ? (nomesForma[r.formaPagamento] ?? r.formaPagamento) : null;
  const numero = `#${r.numero}`;

  const linhas = r.itens
    .map(
      (i) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee3d6;font-size:15px;color:#43382f;">
            ${i.quantidade > 1 ? `${i.quantidade}× ` : ''}${escapar(i.nome)}
          </td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #eee3d6;font-size:15px;color:#43382f;white-space:nowrap;">
            ${brl(i.valorCentavos * i.quantidade)}
          </td>
        </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f6f1ea;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1ea;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fbf8f3;border:1px solid #e6dccd;border-radius:22px;">
        <tr><td align="center" style="padding:40px 32px 8px;font-family:Georgia,'Times New Roman',serif;">
          <div style="font-size:22px;letter-spacing:4px;color:#43382f;">N <span style="color:#c58a83;">&amp;</span> V</div>
          <h1 style="margin:18px 0 6px;font-weight:normal;font-style:italic;font-size:30px;color:#43382f;">Muito obrigado, ${escapar(primeiroNome)}!</h1>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#6b5e52;">
            Seu presente chegou e vai fazer parte do começo da nossa nova vida.<br>Este é o recibo do seu presente.
          </p>
        </td></tr>
        <tr><td style="padding:24px 32px 0;font-family:Arial,Helvetica,sans-serif;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${linhas}
            <tr>
              <td style="padding:14px 0 0;font-family:Georgia,serif;font-size:18px;color:#8f544e;">Total pago</td>
              <td align="right" style="padding:14px 0 0;font-family:Georgia,serif;font-size:20px;color:#8f544e;">${brl(r.totalCentavos)}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:22px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.8;color:#8c7d6f;">
          Pedido <strong style="color:#43382f;">${numero}</strong><br>
          Pago em ${escapar(data)}${forma ? ` · ${forma}` : ''}<br>
          Presente para ${escapar(casal)} · ${escapar(casamento.dataExtenso)}
        </td></tr>
        ${
          r.mensagem
            ? `<tr><td style="padding:22px 32px 0;">
          <div style="background:#f8eeea;border-radius:14px;padding:16px 20px;font-family:Georgia,serif;font-style:italic;font-size:15px;line-height:1.6;color:#6b5e52;">
            “${escapar(r.mensagem)}”
          </div>
        </td></tr>`
            : ''
        }
        <tr><td align="center" style="padding:30px 32px 36px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#a88f7e;">
          Com carinho, ${escapar(casal)}<br>
          O pagamento foi processado com segurança pelo Stripe.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texto = [
    `Muito obrigado, ${primeiroNome}!`,
    '',
    `Seu presente para ${casal} chegou. Este é o recibo.`,
    '',
    ...r.itens.map((i) => `- ${i.quantidade > 1 ? `${i.quantidade}x ` : ''}${i.nome}: ${brl(i.valorCentavos * i.quantidade)}`),
    `Total pago: ${brl(r.totalCentavos)}`,
    '',
    `Pedido ${numero} · pago em ${data}${forma ? ` · ${forma}` : ''}`,
    r.mensagem ? `\nSua mensagem: "${r.mensagem}"` : '',
    '',
    `Com carinho, ${casal}`,
  ].join('\n');

  await transporte.sendMail({
    from: config.smtp.from,
    replyTo: config.smtp.replyTo || undefined,
    to: { name: r.nome, address: r.email },
    subject: `Recibo do seu presente para ${casal} · ${numero}`,
    text: texto,
    html,
  });
}

export type EmailConvite = { nome: string; email: string; convidadoPor: string; link: string; validadeDias: number };

// Invitation to the couple's panel, with the link to create the password.
export async function enviarConviteUsuario(c: EmailConvite) {
  const casal = `${casamento.noiva} & ${casamento.noivo}`;
  const primeiroNome = c.nome.split(' ')[0];
  const recursos = [
    ['Convidados', 'confirmações de presença e QR Codes dos convites'],
    ['Lista de presentes', 'categorias, valores e presentes recebidos'],
    ['Galeria e recados', 'fotos do site e mensagens do mural'],
  ];

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f6f1ea;">
  <div style="display:none;max-height:0;overflow:hidden;color:#f6f1ea;">${escapar(c.convidadoPor)} convidou você para o painel do casamento de ${escapar(casal)}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1ea;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbf8f3;border:1px solid #e6dccd;border-radius:24px;overflow:hidden;">
        <tr><td align="center" style="background:#f2e1dc;padding:38px 28px 34px;font-family:Georgia,'Times New Roman',serif;">
          <div style="font-size:13px;letter-spacing:5px;text-transform:uppercase;color:#a86b64;font-family:Arial,Helvetica,sans-serif;">Painel dos noivos</div>
          <div style="margin:14px 0 4px;font-size:40px;font-style:italic;color:#43382f;">${escapar(casamento.noiva)} <span style="color:#c58a83;">&amp;</span> ${escapar(casamento.noivo)}</div>
          <div style="font-size:14px;letter-spacing:3px;color:#8f544e;font-family:Arial,Helvetica,sans-serif;">${escapar(casamento.dataExtenso)}</div>
        </td></tr>
        <tr><td align="center" style="padding:36px 36px 8px;font-family:Georgia,'Times New Roman',serif;">
          <h1 style="margin:0 0 12px;font-weight:normal;font-style:italic;font-size:28px;color:#43382f;">Olá, ${escapar(primeiroNome)}!</h1>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#6b5e52;">
            <strong style="color:#43382f;">${escapar(c.convidadoPor)}</strong> convidou você para ajudar a cuidar do site do casamento.
            Crie sua senha para entrar no painel.
          </p>
        </td></tr>
        <tr><td align="center" style="padding:28px 36px 10px;">
          <a href="${c.link}" style="display:inline-block;background:#c58a83;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;letter-spacing:3px;text-transform:uppercase;padding:16px 34px;border-radius:999px;">Criar minha senha</a>
          <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#a88f7e;">O link vale por ${c.validadeDias} dias e só pode ser usado uma vez.</p>
        </td></tr>
        <tr><td style="padding:26px 36px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8eeea;border-radius:16px;">
            <tr><td style="padding:18px 22px 6px;font-family:Georgia,serif;font-size:17px;font-style:italic;color:#8f544e;">No painel você vai encontrar</td></tr>
            ${recursos
              .map(
                ([titulo, texto]) => `<tr><td style="padding:6px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#6b5e52;">
              <span style="color:#c58a83;">♥</span>&nbsp; <strong style="color:#43382f;">${titulo}</strong> · ${texto}
            </td></tr>`,
              )
              .join('')}
            <tr><td style="padding:0 0 14px;"></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 36px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#a88f7e;">
          Se o botão não funcionar, copie e cole este endereço no navegador:<br>
          <a href="${c.link}" style="color:#a86b64;word-break:break-all;">${c.link}</a>
        </td></tr>
        <tr><td align="center" style="padding:28px 36px 34px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#a88f7e;">
          Com carinho, ${escapar(casal)}<br>
          Não esperava este convite? É só ignorar este e-mail: nenhuma conta é ativada sem a senha.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texto = [
    `Olá, ${primeiroNome}!`,
    '',
    `${c.convidadoPor} convidou você para o painel do casamento de ${casal}.`,
    'Crie sua senha neste link:',
    c.link,
    '',
    `O link vale por ${c.validadeDias} dias e só pode ser usado uma vez.`,
    '',
    `Com carinho, ${casal}`,
  ].join('\n');

  await transporte.sendMail({
    from: config.smtp.from,
    replyTo: config.smtp.replyTo || undefined,
    to: { name: c.nome, address: c.email },
    subject: `${c.convidadoPor} convidou você para o painel do casamento de ${casal}`,
    text: texto,
    html,
  });
}

export type EmailRecuperacao = { nome: string; email: string; link: string; validadeMinutos: number };

// "Forgot my password": link to create a new one.
export async function enviarRecuperacaoSenha(r: EmailRecuperacao) {
  const casal = `${casamento.noiva} & ${casamento.noivo}`;
  const primeiroNome = r.nome.split(' ')[0];
  const validade = r.validadeMinutos >= 60 ? `${Math.round(r.validadeMinutos / 60)} hora${r.validadeMinutos >= 120 ? 's' : ''}` : `${r.validadeMinutos} minutos`;

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f6f1ea;">
  <div style="display:none;max-height:0;overflow:hidden;color:#f6f1ea;">Link para criar uma nova senha do painel do casamento. Vale por ${validade}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1ea;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbf8f3;border:1px solid #e6dccd;border-radius:24px;overflow:hidden;">
        <tr><td align="center" style="background:#f2e1dc;padding:34px 28px 30px;font-family:Georgia,'Times New Roman',serif;">
          <div style="font-size:13px;letter-spacing:5px;text-transform:uppercase;color:#a86b64;font-family:Arial,Helvetica,sans-serif;">Painel dos noivos</div>
          <div style="margin:12px 0 0;font-size:34px;font-style:italic;color:#43382f;">${escapar(casamento.noiva)} <span style="color:#c58a83;">&amp;</span> ${escapar(casamento.noivo)}</div>
        </td></tr>
        <tr><td align="center" style="padding:34px 36px 6px;font-family:Georgia,'Times New Roman',serif;">
          <h1 style="margin:0 0 12px;font-weight:normal;font-style:italic;font-size:27px;color:#43382f;">Vamos criar uma nova senha, ${escapar(primeiroNome)}?</h1>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#6b5e52;">
            Recebemos um pedido para recuperar a senha do painel de <strong style="color:#43382f;">${escapar(r.email)}</strong>.
            Toque no botão abaixo para escolher uma nova.
          </p>
        </td></tr>
        <tr><td align="center" style="padding:28px 36px 8px;">
          <a href="${r.link}" style="display:inline-block;background:#c58a83;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;letter-spacing:3px;text-transform:uppercase;padding:16px 34px;border-radius:999px;">Criar nova senha</a>
          <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#a88f7e;">O link vale por ${validade} e só pode ser usado uma vez.</p>
        </td></tr>
        <tr><td style="padding:24px 36px 0;">
          <div style="background:#f8eeea;border-radius:16px;padding:16px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#6b5e52;">
            <strong style="color:#8f544e;">Não pediu?</strong> É só ignorar este e-mail: sua senha continua a mesma.
            Ao criar a nova senha, todos os aparelhos conectados saem do painel.
          </div>
        </td></tr>
        <tr><td style="padding:22px 36px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#a88f7e;">
          Se o botão não funcionar, copie e cole este endereço no navegador:<br>
          <a href="${r.link}" style="color:#a86b64;word-break:break-all;">${r.link}</a>
        </td></tr>
        <tr><td align="center" style="padding:26px 36px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#a88f7e;">
          Com carinho, ${escapar(casal)}<br>
          Este é um e-mail automático; respostas não são lidas.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texto = [
    `Olá, ${primeiroNome}!`,
    '',
    `Recebemos um pedido para recuperar a senha do painel de ${r.email}.`,
    'Crie uma nova senha neste link:',
    r.link,
    '',
    `O link vale por ${validade} e só pode ser usado uma vez.`,
    'Não pediu? Ignore este e-mail: sua senha continua a mesma.',
    '',
    `Com carinho, ${casal}`,
  ].join('\n');

  await transporte.sendMail({
    from: config.smtp.from,
    replyTo: config.smtp.replyTo || undefined,
    to: { name: r.nome, address: r.email },
    subject: `Recuperar sua senha do painel · ${casal}`,
    text: texto,
    html,
  });
}
