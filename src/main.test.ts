import assert from "node:assert";
import test, { before, describe, it } from "node:test";
import path from "node:path";
import {
  analyzeOpenapiCodegenFiles,
  createOpenapiTypescriptCodegenFiles,
  generateReactQueryHooksFile,
} from "./Program";
import { inspect } from "node:util";

const OUTPUT_PATH = "test-output";

inspect.defaultOptions.depth = 5;

describe("code generation", async () => {
  before(async () => {
    await createOpenapiTypescriptCodegenFiles({
      input: "resources/petstore.json",
      output: OUTPUT_PATH,
    });
  });
  it("generate React Query hooks", async () => {
    const analyzedMethods = await analyzeOpenapiCodegenFiles({
      outputPath: OUTPUT_PATH,
    });
    await generateReactQueryHooksFile({
      methods: analyzedMethods,
      outputPath: OUTPUT_PATH,
    });
  });
});
