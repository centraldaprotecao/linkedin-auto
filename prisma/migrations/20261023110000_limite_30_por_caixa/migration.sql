-- Teto padrão de e-mails por dia de uma caixa nova: 30 (era 40). Só muda o padrão das caixas cadastradas daqui para frente; as existentes não mudam.
ALTER TABLE "Mailbox" ALTER COLUMN "dailyLimit" SET DEFAULT 30;

-- DESFAZER: ALTER TABLE "Mailbox" ALTER COLUMN "dailyLimit" SET DEFAULT 40;
