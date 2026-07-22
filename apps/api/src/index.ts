import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { SecretItem, SecretType } from "@ops-vault/core";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

/** In-memory store — ciphertext only (zero-knowledge). Replace with @ops-vault/db later. */
const vault = new Map<string, SecretItem>();

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "ops-vault-api",
    secrets: vault.size,
  })
);

app.get("/secrets", (c) => {
  const items = [...vault.values()].map(({ encryptedData: _, ...meta }) => meta);
  return c.json({ items });
});

app.get("/secrets/:id", (c) => {
  const item = vault.get(c.req.param("id"));
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
});

app.post("/secrets", async (c) => {
  const body = await c.req.json<{
    type: SecretType;
    title: string;
    encryptedData: string;
    tags?: string[];
  }>();

  if (!body?.type || !body?.title || !body?.encryptedData) {
    return c.json(
      { error: "type, title and encryptedData are required" },
      400
    );
  }

  const now = new Date().toISOString();
  const item: SecretItem = {
    id: crypto.randomUUID(),
    type: body.type,
    title: body.title,
    encryptedData: body.encryptedData,
    tags: body.tags,
    createdAt: now,
    updatedAt: now,
  };

  vault.set(item.id, item);
  return c.json(item, 201);
});

app.delete("/secrets/:id", (c) => {
  const id = c.req.param("id");
  if (!vault.has(id)) return c.json({ error: "Not found" }, 404);
  vault.delete(id);
  return c.json({ ok: true });
});

const port = Number(process.env.PORT ?? 8787);

console.log(`ops-vault api listening on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
