-- Cliente importado pela planilha com CPF errado: ele entra sem CPF e guarda aqui o que veio na
-- planilha. Enquanto não tiver CPF, recebe a etiqueta automática "CPF inválido" no lugar de
-- "Falta CPF".
ALTER TABLE `patients`
  ADD COLUMN `imported_invalid_cpf` VARCHAR(40) NULL;
