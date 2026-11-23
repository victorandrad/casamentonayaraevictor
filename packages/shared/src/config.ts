// Wedding data used by more than one microfrontend.
export const casamento = {
  noiva: 'Nayara',
  noivo: 'Victor',
  dataISO: '2027-08-28T16:00:00-03:00',
  dataCurta: '28 · 08 · 2027',
  dataExtenso: '28 de agosto de 2027',
  diaSemana: 'Sábado',
  cidade: 'Itu, SP',
  rsvpAte: '01 de agosto de 2027',
};

// Only the ceremony is public: the reception address comes from the API, for invites marked for it.
export const locais = {
  cerimonia: {
    nome: 'Paróquia São José',
    horario: '16h00',
    linhas: ['Paróquia São José', 'R. Gagliano Micai, s/n · Vila Cleto', 'Itu · São Paulo'],
    descricao:
      'Paróquia São José · R. Gagliano Micai, s/n — Vila Cleto, Itu · SP, 13310-282. A cerca de 100 km de São Paulo, com acesso pela Rodovia Castelo Branco.',
    maps: 'https://www.google.com/maps/search/?api=1&query=Par%C3%B3quia+S%C3%A3o+Jos%C3%A9+R.+Gagliano+Micai+Vila+Cleto+Itu+SP+13310-282',
    embed:
      'https://maps.google.com/maps?q=Par%C3%B3quia%20S%C3%A3o%20Jos%C3%A9%20R.%20Gagliano%20Micai%20Vila%20Cleto%20Itu%20SP&z=15&output=embed',
  },
};
