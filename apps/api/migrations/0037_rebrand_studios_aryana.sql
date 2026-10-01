-- Rebranding: o CRM e a clínica do seed passam a se chamar "Studios Aryana" e a
-- gestora do seed passa a se chamar "Aryana Dutra". E-mail e senha não mudam.
-- Atualiza apenas pelos ids fixos do seed; sem efeito se não existirem.
UPDATE clinics
SET name = 'Studios Aryana',
    legal_name = 'Studios Aryana Ltda.',
    updated_at = now()
WHERE id = '11111111-1111-4111-8111-111111111111';

UPDATE users
SET full_name = 'Aryana Dutra',
    updated_at = now()
WHERE id = '22222222-2222-4222-8222-222222222222';
