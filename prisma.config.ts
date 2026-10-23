import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Migrações usam a conexão direta (DIRECT_URL); o sistema em si usa DATABASE_URL (com pooler, no Supabase).
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
