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
  numero: number;
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
  const numero = `#${String(r.numero).padStart(5, '0')}`;

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
