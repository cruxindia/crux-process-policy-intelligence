import next from "eslint-config-next";

const config = [...next, { ignores: [".next/**", "node_modules/**", "lib/database.types.ts"] }];
export default config;
