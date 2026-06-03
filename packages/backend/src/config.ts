import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "127.0.0.1",
  reoservBaseUrl: process.env.REOSERV_BASE_URL ?? "http://127.0.0.1:8090",
};
