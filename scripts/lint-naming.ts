/**
 * Build gate: abort if the server name or any tool name violates Kakao rules
 * (forbidden "kakao" token, charset, duplicates, count). Run by `npm run build`.
 */
import { SERVER_NAME } from "../src/lib/constants.js";
import { assertNamingOk } from "../src/lib/naming.js";
import { TOOL_NAMES } from "../src/tools/index.js";

try {
  assertNamingOk(SERVER_NAME, TOOL_NAMES);
  console.log(`✅ naming OK — server "${SERVER_NAME}", ${TOOL_NAMES.length} tools: ${TOOL_NAMES.join(", ")}`);
} catch (err) {
  console.error(`❌ ${(err as Error).message}`);
  process.exit(1);
}
