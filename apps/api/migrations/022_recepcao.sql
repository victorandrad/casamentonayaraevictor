-- Só alguns convites dão acesso à recepção: o endereço dela só é mostrado para esses códigos.
ALTER TABLE convidados ADD COLUMN recepcao boolean NOT NULL DEFAULT false;
