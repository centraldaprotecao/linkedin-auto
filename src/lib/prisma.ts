import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { currentClientId } from "@/lib/tenant";

const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient };

function createClient() {
  // DATABASE_SCHEMA: o sistema pode morar num esquema próprio (ex.: "central") dentro de um Postgres compartilhado com outro sistema (Supabase da DOR$).
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DATABASE_POOL_MAX) || 5 }, { schema: process.env.DATABASE_SCHEMA || undefined });
  return new PrismaClient({ adapter });
}

const base = globalForPrisma.prismaBase ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = base;

// ---------------------------------------------------------------------------------------------
// Isolamento entre clientes. TODO acesso comum ao banco passa por `prisma` (abaixo): ele descobre o
// cliente da requisição (src/lib/tenant.ts) e acrescenta o filtro em toda consulta, e o dono em toda
// criação. Sem cliente no contexto, a consulta falha (nunca devolve dados de todos).
// `prismaSystem` NÃO filtra: só para quem ainda não sabe o cliente (login, convites, webhooks que
// descobrem o cliente pela identidade, robô, rotas /api/ops). Uso restrito, conferido por
// scripts/test-isolation.ts.
// ---------------------------------------------------------------------------------------------
export const prismaSystem = base;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const scoped = new Set([...models.values()].filter((m) => m.fields.some((f) => f.name === "clientId")).map((m) => m.name));
const relationTarget = (model: string, field: string): string | null => {
  const f = models.get(model)?.fields.find((x) => x.name === field);
  return f && f.kind === "object" ? f.type : null;
};
// Relação que guarda a chave estrangeira neste modelo (lead: { connect } na mensagem): obriga a entrada "com relações".
// (O dmmf em tempo de execução não traz relationFromFields; neste esquema a chave sempre se chama <relação>Id.)
const ownsForeignKey = (model: string, field: string): boolean => {
  const fields = models.get(model)?.fields ?? [];
  return fields.some((x) => x.name === field && x.kind === "object") && fields.some((x) => x.name === `${field}Id` && x.kind === "scalar");
};

// Apelido antigo: Settings tinha uma linha só, `{ id: "singleton" }`. Agora é a linha do cliente.
function where(model: string, w: unknown, clientId: string): Rec {
  const out: Rec = isRec(w) ? { ...w } : {};
  if (model === "Settings" && out.id === "singleton") delete out.id;
  out.clientId = clientId;
  return out;
}

// Dados de criação: grava o dono (e nos filhos criados junto, o mesmo dono).
function ownCreate(model: string, data: unknown, clientId: string): unknown {
  if (Array.isArray(data)) return data.map((d) => ownCreate(model, d, clientId));
  if (!isRec(data)) return data;
  const out: Rec = { ...scopeNested(model, data, clientId) };
  if (model === "Settings" && out.id === "singleton") delete out.id;
  // Entrada "com relações" (lead: { connect }) não aceita o campo escalar: troca por client: { connect }.
  const hasRelations = Object.keys(out).some((k) => k !== "client" && ownsForeignKey(model, k));
  if (hasRelations) {
    delete out.clientId;
    out.client = { connect: { id: clientId } };
  } else {
    delete out.client;
    out.clientId = clientId;
  }
  return out;
}

// Criações dentro de criações/atualizações (messages: { create: ... }): também ganham o dono.
function scopeNested(model: string, data: Rec, clientId: string): Rec {
  const out: Rec = { ...data };
  for (const [key, value] of Object.entries(out)) {
    const target = relationTarget(model, key);
    if (!target || !scoped.has(target) || !isRec(value)) continue;
    const v: Rec = { ...value };
    if ("create" in v) v.create = ownCreate(target, v.create, clientId);
    if (isRec(v.createMany)) v.createMany = { ...v.createMany, data: ownCreate(target, v.createMany.data, clientId) };
    if ("connectOrCreate" in v) {
      const list = Array.isArray(v.connectOrCreate) ? v.connectOrCreate : [v.connectOrCreate];
      const mapped = list.map((c) => (isRec(c) ? { ...c, create: ownCreate(target, c.create, clientId) } : c));
      v.connectOrCreate = Array.isArray(v.connectOrCreate) ? mapped : mapped[0];
    }
    if ("upsert" in v) {
      const list = Array.isArray(v.upsert) ? v.upsert : [v.upsert];
      const mapped = list.map((u) =>
        isRec(u) ? { ...u, create: ownCreate(target, u.create, clientId), update: isRec(u.update) ? scopeNested(target, u.update, clientId) : u.update } : u,
      );
      v.upsert = Array.isArray(v.upsert) ? mapped : mapped[0];
    }
    out[key] = v;
  }
  return out;
}

const WITH_WHERE = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy", "update", "updateMany", "updateManyAndReturn", "delete", "deleteMany"]);

export function scopeArgs(model: string, operation: string, args: unknown, clientId: string): unknown {
  const a: Rec = isRec(args) ? { ...args } : {};
  if (WITH_WHERE.has(operation)) {
    a.where = where(model, a.where, clientId);
    if ((operation === "update" || operation === "updateMany" || operation === "updateManyAndReturn") && isRec(a.data)) {
      const d = scopeNested(model, a.data, clientId);
      delete d.clientId; // ninguém muda o dono de um registro
      delete d.client;
      a.data = d;
    }
  } else if (operation === "create" || operation === "createMany" || operation === "createManyAndReturn") {
    a.data = ownCreate(model, a.data, clientId);
  } else if (operation === "upsert") {
    a.where = where(model, a.where, clientId);
    a.create = ownCreate(model, a.create, clientId);
    if (isRec(a.update)) {
      a.update = scopeNested(model, a.update, clientId);
      delete (a.update as Rec).clientId;
      delete (a.update as Rec).client;
    }
  } else {
    throw new Error(`Operação sem regra de isolamento: ${model}.${operation}`);
  }
  return a;
}

export const prisma = base.$extends({
  name: "isolamento-por-cliente",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // Modelo sem dono (Client, LoginAttempt) é do sistema, não do cliente: só pelo prismaSystem.
        if (!scoped.has(model)) throw new Error(`O modelo ${model} não é de um cliente: use prismaSystem.`);
        const clientId = await currentClientId();
        return query(scopeArgs(model, operation, args, clientId) as typeof args);
      },
    },
  },
});

// Cliente do banco ou transação interativa (as duas já vêm com o isolamento).
export type Db = typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
