-- O campo "Tipo de cliente" (fixo/rotativo) saiu do cadastro: apaga o valor guardado no perfil.
UPDATE patients SET profile = profile - 'clientType' WHERE profile ? 'clientType';
UPDATE leads SET profile = profile - 'clientType' WHERE profile ? 'clientType';
