import { defineConfig } from "vite";
import https from "node:https";

const SPRITE_PROXY_PREFIX = "/pokemon-sprites/";
const SHOWDOWN_SPRITE_HOST = "play.pokemonshowdown.com";

function showdownSpriteProxy() {
  return {
    name: "showdown-sprite-proxy",
    configureServer(server) {
      server.middlewares.use(SPRITE_PROXY_PREFIX, (request, response) => {
        proxySpriteRequest(request.url ?? "", response);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(SPRITE_PROXY_PREFIX, (request, response) => {
        proxySpriteRequest(request.url ?? "", response);
      });
    }
  };
}

function proxySpriteRequest(path, response) {
  const normalizedPath = path.replace(/^\/+/, "");
  if (!/^[a-z0-9/_-]+\.(png|gif)$/i.test(normalizedPath)) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Invalid sprite path.");
    return;
  }

  const upstreamRequest = https.get(
    {
      hostname: SHOWDOWN_SPRITE_HOST,
      path: `/sprites/${normalizedPath}`,
      headers: {
        "user-agent": "pokereign-dev-proxy"
      }
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, {
        "content-type":
          upstreamResponse.headers["content-type"] ??
          (normalizedPath.endsWith(".gif") ? "image/gif" : "image/png"),
        "cache-control": "public, max-age=3600"
      });
      upstreamResponse.pipe(response);
    }
  );

  upstreamRequest.on("error", () => {
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end("Failed to fetch sprite.");
  });
}

export default defineConfig({
  plugins: [showdownSpriteProxy()]
});
