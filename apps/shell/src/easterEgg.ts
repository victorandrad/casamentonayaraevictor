import { casamento } from '@nv/shared';

// A little surprise for whoever opens the browser console: a parchment note in the Marauder's Map
// style and two "spells" to type there — one replays the map opening, the other closes the mischief.
const PERGAMINHO =
  'font-family: "IM Fell English", Georgia, serif; color: #4a2f1b; background: #f1e3c0; padding: 6px 14px; border-left: 3px solid #7a2a1c;';
const TITULO = `${PERGAMINHO} font-size: 20px; font-style: italic;`;
const TEXTO = `${PERGAMINHO} font-size: 13px;`;
const ROSA = 'font-family: Georgia, serif; font-size: 13px; color: #c58a83;';

const CONTATO = {
  site: 'https://casamentonayaraevictor.com.br',
  repositorio: 'https://github.com/victorandrad/casamentonayaraevictor',
  autor: 'https://github.com/victorandrad',
  email: 'contato@casamentonayaraevictor.com.br',
};

const MONOGRAMA = String.raw`
        _   _          __     __
       | \ | |   ___   \ \   / /
       |  \| |  ( _ )   \ \ / /
       | |\  |  / _ \/\  \ V /
       |_| \_| | (_>  <   \_/
                \___/\/
`;

// Common ways of typing the spells (solenimente, all lower case…) work too.
const APELIDOS = {
  juroSolenemente: ['juroSolenimente', 'jurosolenemente', 'jurosolenimente', 'JuroSolenemente', 'JuroSolenimente'],
  malfeitoFeito: ['malFeitoFeito', 'malfeitofeito', 'MalfeitoFeito', 'MalFeitoFeito'],
};
type Feitico = () => string;

export function easterEgg() {
  console.log(`%c${MONOGRAMA}`, 'color: #c58a83; font-weight: bold;');
  console.log('%cOs Senhores Aluado, Rabicho, Almofadinhas & Pontas', TITULO);
  console.log(
    `%cestão orgulhosos em apresentar o casamento de ${casamento.noiva} & ${casamento.noivo}.\n` +
      'Se você chegou até aqui, é curioso como um Maroto. Experimente digitar:',
    TEXTO,
  );
  console.log('%c  juroSolenemente()  %c→ abre o mapa de novo', `${PERGAMINHO} font-family: monospace;`, ROSA);
  console.log('%c  malfeitoFeito()    %c→ esconde os segredos', `${PERGAMINHO} font-family: monospace;`, ROSA);
  console.log(
    '%cO mapa dos bastidores%c\n' +
      `✦ Site       ${CONTATO.site}\n` +
      `✦ Código     ${CONTATO.repositorio}\n` +
      `✦ Feito por  Victor · ${CONTATO.autor}\n` +
      `✦ Contato    ${CONTATO.email}\n` +
      'Achou um bug ou quer saber como foi feito? Abra uma issue ou mande um e-mail. 🤍',
    `${PERGAMINHO} font-size: 13px; font-weight: bold;`,
    ROSA,
  );

  const juroSolenemente: Feitico = () => {
    if (location.pathname.replace(/\/+$/, '') !== '') {
      location.href = '/#mapa'; // from the panel: back to the site, which opens the map
    } else if (location.hash === '#mapa') {
      // a hash change only fires when the value changes: step out and back in to replay it
      location.hash = '';
      setTimeout(() => (location.hash = 'mapa'), 0);
    } else {
      location.hash = 'mapa';
    }
    return '✦ Eu juro solenemente que vou celebrar com vocês. ✦';
  };

  const malfeitoFeito: Feitico = () => {
    console.clear();
    console.log('%cCom muito amor esse dia será feito.', TITULO);
    console.log(`%cNos vemos em ${casamento.dataExtenso}. 🤍`, ROSA);
    return '✦ Malfeito feito. ✦';
  };

  const magia = window as unknown as Record<string, Feitico>;
  for (const [nome, feitico] of [['juroSolenemente', juroSolenemente], ['malfeitoFeito', malfeitoFeito]] as const) {
    magia[nome] = feitico;
    for (const apelido of APELIDOS[nome]) magia[apelido] = feitico;
  }
}
