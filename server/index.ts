import { configFromEnv, createApp } from "./app";

const options = configFromEnv();
const port = Number(process.env.ADAPTER_PORT || 8787);
const host = process.env.ADAPTER_HOST || "127.0.0.1";
const { app, store } = createApp(options);

const server = app.listen(port, host, () => {
  const label = options.mode === "development" ? "DEVELOPMENT ADAPTER. Synthetic data only. Not the mission database." : "PROXY. Demo routes disabled.";
  console.log(`AEGIS citizen tracking listening on http://${host}:${port}. Mode=${options.mode}. ${label}`);
});

function shutdown() {
  store.stop();
  server.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
