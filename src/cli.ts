#!/usr/bin/env node
import { Command } from "commander";
import packageJson from "../package.json";
import { Options } from "openapi-typescript-codegen";
import {
  analyzeOpenapiCodegenFiles,
  createOpenapiTypescriptCodegenFiles,
  generateReactQueryHooksFile,
} from "./Program";

export type CLIOptions = {
  output?: string;
  skipDeprecated?: boolean;
  apiClientName: Options["clientName"];
  httpClientName?: Options["httpClient"];
} & Pick<
  Options,
  | "exportSchemas"
  | "postfixModels"
  | "postfixServices"
  | "request"
  | "indent"
  | "input"
>;

const program = new Command();

program
  .name("openapi-react-query-code-generator")
  .version(packageJson.version)
  .description(
    "Uses openapi-typescript-codegen under the hood, and then analyzes the TypeScript AST of the generated files to create TanStack React Query hooks."
  )
  .requiredOption(
    "-i, --input <value>",
    "A path, URL or string OpenAPI schema."
  )
  .option(
    "-o, --output <value>",
    "The output directory where files will be generated. For the path provided, additional subdirectories will be created to store generated files.",
    "openapi"
  )
  .parse();

const options = program.opts<CLIOptions>();

async function main(options: CLIOptions) {
  const input = options.input as string;
  const output = options.output as string;

  await createOpenapiTypescriptCodegenFiles({
    input,
    output,
  });
  const analyzedMethods = await analyzeOpenapiCodegenFiles({
    outputPath: output,
  });
  await generateReactQueryHooksFile({
    methods: analyzedMethods,
    outputPath: output,
  });
}

main(options);
