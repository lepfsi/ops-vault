import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(rootDir, "../..");

/**
 * Ports (avoid clash with OpsGate on 5173/8787):
 *   OPS_VAULT_WEB_PORT  default 5180
 *   OPS_VAULT_API_PORT  default 8790
 *   VITE_API_PROXY      full URL of API, default http://127.0.0.1:${API_PORT}
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, monorepoRoot, "");
  const webPort = Number(
    env.OPS_VAULT_WEB_PORT || process.env.OPS_VAULT_WEB_PORT || 5180
  );
  const apiPort = Number(
    env.OPS_VAULT_API_PORT || process.env.OPS_VAULT_API_PORT || 8790
  );
  const apiTarget =
    env.VITE_API_PROXY ||
    process.env.VITE_API_PROXY ||
    `http://127.0.0.1:${apiPort}`;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@ops-vault/ui": path.resolve(monorepoRoot, "packages/ui/src/index.ts"),
        "@ops-vault/core": path.resolve(
          monorepoRoot,
          "packages/core/src/index.ts"
        ),
      },
    },
    server: {
      port: webPort,
      strictPort: false,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
          configure: (proxy) => {
            proxy.on("error", (_err, _req, res) => {
              if (
                res &&
                "writeHead" in res &&
                typeof res.writeHead === "function"
              ) {
                res.writeHead(502, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    error: `API down at ${apiTarget} — set OPS_VAULT_API_PORT or run pnpm dev:api`,
                  })
                );
              }
            });
          },
        },
      },
    },
    preview: {
      port: webPort,
    },
  };
});
