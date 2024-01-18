import { generate as openapiTypescriptCodegenWriter } from "openapi-typescript-codegen";
import { Project, ScriptTarget, TypeFormatFlags } from "ts-morph";
import prettier from "prettier";
import fs from "fs/promises";
import path from "path";
import { inspect } from "util";

export interface ProgramOptions {}

export const capitalizeFirstLetter = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export async function formatFileWithPrettier(
  inputFilePath: string,
  outputFilePath: string
) {
  const fileContent = await fs.readFile(inputFilePath, "utf8");
  const prettierConfig = await prettier.resolveConfig(inputFilePath);
  const writtenFilePath = await fs.writeFile(
    outputFilePath,
    await prettier.format(fileContent, {
      ...prettierConfig,
      filepath: inputFilePath,
    })
  );

  return writtenFilePath;
}

export async function createOpenapiTypescriptCodegenFiles({
  input,
  output,
  clientName = "ApiClient",
  format = true,
}: {
  /**
   * Path, URL, or string content of an OpenAPI schema.
   */
  input: string;
  /**
   * Subdirectories 'core', 'models', and 'services' will be created in the output folder you choose.
   */
  output: string;
  clientName?: string;
  format?: boolean;
}) {
  await openapiTypescriptCodegenWriter({
    input,
    output,
    useOptions: true,
    useUnionTypes: true,
    clientName,
    httpClient: "fetch",
  });
  if (format) {
    const dir = await fs.readdir(output, {
      withFileTypes: true,
      recursive: true,
    });
    const filePaths = dir
      .filter((item) => !item.isDirectory())
      .map((item) => path.join(item.path, item.name));
    return Promise.all(
      filePaths.map((filePath) => formatFileWithPrettier(filePath, filePath))
    );
  }
}

export async function getModelFileNames({
  outputPath,
}: {
  outputPath: string;
}) {
  const dir = await fs.readdir(outputPath, {
    withFileTypes: true,
    recursive: true,
  });
  return dir
    .filter((item) => !item.isDirectory())
    .map((item) => path.parse(item.name).name);
}

export interface AnalyzedMethod {
  name: string;
  docs: string;
  isQuery: boolean;
  params: Array<{ name: string; type: string }>;
}

export function analyzeOpenapiCodegenFiles({
  outputPath,
}: {
  outputPath: string;
}) {
  const project = new Project({
    compilerOptions: {
      target: ScriptTarget.ESNext,
    },
  });

  project.addSourceFilesAtPaths(path.join(outputPath, "/**/*{.d.ts,.ts}"));
  project.resolveSourceFileDependencies();

  const file = project.getSourceFileOrThrow("DefaultService.ts");

  const klass = file.getClassOrThrow("DefaultService");

  return klass.getInstanceMethods().map((method) => ({
    name: method.getName(),
    docs: method
      .getJsDocs()
      .map((doc) => doc.getText())
      .join("\n"),
    isQuery: !!method
      .getBody()
      ?.getText()
      .match(/method:.*get/i),
    params: method
      .getParameters()[0]
      .getType()
      .getProperties()
      .map((p) => {
        const type = p.getTypeAtLocation(file);
        return {
          name: p.getName(),
          type: type.getText(
            method.getParameters()[0],
            TypeFormatFlags.NoTruncation |
              TypeFormatFlags.WriteArrayAsGenericType
          ),
        };
      }),
  })) as AnalyzedMethod[];
}

export async function generateReactQueryHooksFile({
  methods,
  outputPath,
}: {
  methods: AnalyzedMethod[];
  outputPath: string;
}) {
  const project = new Project({
    compilerOptions: {
      target: ScriptTarget.ESNext,
    },
  });
  const file = project.createSourceFile(
    path.join(outputPath, "hooks.ts"),
    undefined,
    {
      overwrite: true,
    }
  );

  const modelsFileNames = await getModelFileNames({
    outputPath: path.join(outputPath, "models"),
  });

  file.insertText(
    file.getPos(),
    `
import { createContext, useContext } from "react";
import {
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
${modelsFileNames.map((fileName) => `import { ${fileName} } from "./models/${fileName}";`).join("\n")}
import { DefaultService } from "./services/DefaultService";

export const ApiServiceContext = createContext<typeof DefaultService.prototype | null>(null);

${methods.map((method) => (method.isQuery ? createUseQueryFunction({ method }) : createUseMutationFunction({ method }))).join("\n")}
      `
  );
  await file.save();
  formatFileWithPrettier(file.getFilePath(), file.getFilePath());
}

function createUseQueryFunction({ method }: { method: AnalyzedMethod }) {
  return `

export const QueryKey${capitalizeFirstLetter(method.name)} = '${method.name}';

export const use${capitalizeFirstLetter(method.name)} = <
  TData = Awaited<ReturnType<typeof DefaultService.prototype.${method.name}>>,
  TError = unknown
>(
  params: {
    ${method.params.map((param) => `${param.name}: ${param.type};`).join("\n    ")}
  },
  queryOptions?: UseQueryOptions<TData, TError>
) => {
  const apiService = useContext(ApiServiceContext) as DefaultService;
  return useQuery<TData, TError>({
  queryKey: [QueryKey${capitalizeFirstLetter(method.name)}, params],
  queryFn: () =>
    apiService.${method.name}(params) as TData,
  ...queryOptions,
})};
`;
}

function createUseMutationFunction({ method }: { method: AnalyzedMethod }) {
  const paramType = `{ ${method.params.map((param) => `${param.name}: ${param.type};`).join("\n    ")} }`;
  return `
export const use${capitalizeFirstLetter(method.name)} = <
  TData = Awaited<ReturnType<typeof DefaultService.prototype.${method.name}>>,
  TError = unknown,
  TContext = unknown
>(
  mutationOptions?: UseMutationOptions<TData, TError, ${paramType}, TContext>
) => {
  const apiService = useContext(ApiServiceContext) as DefaultService;
  return useMutation<TData, TError, ${paramType}, TContext>({
    mutationFn: (
      params: ${paramType}
    ) =>
      apiService.${method.name}(params) as Promise<TData>,
    ...mutationOptions,
})};
`;
}
