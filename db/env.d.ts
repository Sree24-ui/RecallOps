declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ENABLE_TEST_FIXTURES?: string;
    ANAKIN_API_KEY?: string;
    PUBLIC_BASE_URL?: string;
    OPERATOR_TOKEN?: string;
  }
}
