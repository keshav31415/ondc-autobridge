// Explicit opt-in binding for the local Compose network only.
process.env.API_HOST = "0.0.0.0";
await import("./index");
export {};
