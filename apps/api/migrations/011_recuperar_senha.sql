-- Os mesmos links de uso único servem para convite e para recuperar a senha.
ALTER TABLE convites_usuario
  ADD COLUMN tipo text NOT NULL DEFAULT 'convite' CHECK (tipo IN ('convite', 'recuperacao'));
