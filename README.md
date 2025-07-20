# relaycode-core

[![npm version](https://img.shields.io/npm/v/relaycode-core.svg)](https://www.npmjs.com/package/relaycode-core)
[![License](https://img.shields.io/npm/l/relaycode-core.svg)](https://github.com/relaycoder/relaycode/blob/main/LICENSE)
[![Built with Bun](https://img.shields.io/badge/built%20with-Bun-black?logo=bun)](https://bun.sh)

`relaycode-core` is the brain of the [relaycode](https://relay.code) developer assistant. It provides pure, side-effect-free logic for parsing LLM-generated code patches and calculating the resulting file changes.

## What is `relaycode-core`?

This package is the decoupled core logic extracted from the main `relaycode` CLI tool. It is responsible for two primary tasks:

1.  **Parsing:** Ingesting raw text from an LLM and converting it into a structured `ParsedLLMResponse` object, separating reasoning, operations, and control data.
2.  **Patch Calculation:** Taking a set of file operations and their original contents, then calculating the new file contents after applying the patches.

Crucially, `relaycode-core` is **platform-agnostic and side-effect-free**. It does not read or write files, access the network, or interact with the shell. It is a pure data transformation library, making it highly reusable and testable.

## Key Features & Benefits

*   **🤖 Robust Parsing:** Reliably parses complex LLM responses containing multiple code blocks, reasoning text, and a final YAML control block.
*   **🧩 Advanced Patching:** Supports multiple patch strategies (`replace`, `new-unified`, `multi-search-replace`) by integrating the powerful `diff-apply` library.
*   **📦 Platform Agnostic & Reusable:** Contains zero Node.js-specific dependencies. It can be used in the browser, a VS Code extension, a serverless function, or any other JavaScript environment.
*   **✅ Highly Testable:** The pure-function design allows for simple, predictable unit testing without mocking file systems or child processes.
*   **🔧 Focused & Maintainable:** Adheres to a clean architectural boundary. The logic for parsing and patching can be improved in isolation from the I/O-heavy concerns of a command-line tool.
*   **⚖️ Decoupled by Design:** Free from dependencies on specific tools for state management (`konro`), logging (`chalk`), or user interaction (`commander`), ensuring maximum portability.

## Installation

```bash
npm install relaycode-core
# or
yarn add relaycode-core
# or
bun add relaycode-core
```

## Usage

### High-Level Workflow

The typical workflow for using `relaycode-core` in a consumer application (like a CLI or IDE extension) looks like this:

1.  **Receive Raw Text:** Get the full text output from an LLM.
2.  **Parse the Response:** Use `parseLLMResponse()` to convert the raw text into a structured object. If it returns `null`, the input was not a valid patch.
3.  **Read Original Files:** Your application is responsible for reading the contents of the files specified in the parsed operations. This is the I/O-heavy step that `relaycode-core` avoids.
4.  **Apply Operations:** Pass the parsed operations and the original file contents to `applyOperations()` to calculate the new state of all affected files.
5.  **Write New Files:** Your application takes the resulting file map from `applyOperations()` and writes the changes to the disk.

### Low-Level API Reference

#### `parseLLMResponse()`

Parses the raw string output from an LLM into a structured object.

**Signature:**
```typescript
import { parseLLMResponse, ParsedLLMResponse } from 'relaycode-core';

function parseLLMResponse(rawText: string): ParsedLLMResponse | null;
```

**Example:**
```typescript
import { parseLLMResponse } from 'relaycode-core';

const llmOutput = `
This is my reasoning for the change.

\`\`\`typescript // src/index.ts
export function newFunction() {
  console.log("Hello, World!");
}
\`\`\`

---
### Final Steps

...

\`\`\`yaml
projectId: my-app
uuid: 123e4567-e89b-12d3-a456-426614174000
gitCommitMsg: "feat: add newFunction"
\`\`\`
`;

const parsed = parseLLMResponse(llmOutput);

if (parsed) {
  console.log(parsed.control.gitCommitMsg);
  //> "feat: add newFunction"

  console.log(parsed.operations[0].path);
  //> "src/index.ts"

  console.log(parsed.reasoning);
  //> ["This is my reasoning for the change."]
}
```

---

#### `applyOperations()`

Calculates the result of applying a series of file operations to a set of original file contents. This function is `async` because the underlying patching libraries may be asynchronous.

**Signature:**
```typescript
import { applyOperations, FileOperation, ApplyOperationsResult } from 'relaycode-core';

type ApplyOperationsResult =
    | { success: true; newFileStates: Map<string, string | null> }
    | { success: false; error: string };

async function applyOperations(
    operations: FileOperation[],
    originalFiles: Map<string, string | null>
): Promise<ApplyOperationsResult>;
```
-   `operations`: The `operations` array from a successful `parseLLMResponse` call.
-   `originalFiles`: A map where keys are file paths and values are their string content. A value of `null` signifies the file does not exist. Your application must provide this.

**Example:**
```typescript
import { applyOperations, FileOperation } from 'relaycode-core';

// Typically comes from `parseLLMResponse`
const operations: FileOperation[] = [
  {
    type: 'write',
    path: 'src/config.ts',
    content: 'export const newSetting = true;',
    patchStrategy: 'replace',
  },
  {
    type: 'delete',
    path: 'src/old.ts',
  },
];

// Your application reads the files from disk
const originalFiles = new Map<string, string | null>([
  ['src/config.ts', 'export const oldSetting = false;'],
  ['src/old.ts', '// This file will be deleted'],
]);

const result = await applyOperations(operations, originalFiles);

if (result.success) {
  // result.newFileStates is a Map:
  // {
  //   'src/config.ts' => 'export const newSetting = true;',
  //   'src/old.ts' => null, // null signifies deletion
  // }
  console.log(result.newFileStates.get('src/config.ts'));
} else {
  console.error('Patch application failed:', result.error);
}
```

---

#### `calculateLineChanges()`

A utility function to calculate the number of lines added and removed for a given operation. Useful for displaying stats.

**Signature:**
```typescript
import { calculateLineChanges, FileOperation } from 'relaycode-core';

function calculateLineChanges(
    op: FileOperation,
    originalFiles: Map<string, string | null>,
    newFiles: Map<string, string | null>
): { added: number; removed: number };
```

## Use Cases

`relaycode-core` is the ideal foundation for any tool that needs to programmatically handle code patches generated by AI models.

*   **Primary Consumer:** The [**`relaycode` CLI**](https://relay.code) uses this package to power its core functionality.
*   **IDE Extensions:** A VS Code or JetBrains extension could use this library to apply patches directly in the editor without shelling out to an external tool.
*   **GitHub Bots:** A bot could parse patches from PR comments or issue descriptions and apply them to a branch.
*   **CI/CD Automation:** Automated workflows could use `relaycode-core` to apply standardized refactoring or dependency updates across a codebase.
*   **Web UIs:** A web-based code editor or playground could integrate this library to provide AI-assisted coding features.

## Roadmap

*   **Enhanced Parsing Resilience:** Improve heuristics to handle a wider variety of malformed LLM outputs gracefully.
*   **More Patch Strategies:** Explore and add support for other diffing algorithms as they become available.
*   **First-Party Integrations:** Develop official integrations using this core library, such as a VS Code extension or a GitHub Action.

## Contributing

Contributions are welcome! Whether it's reporting a bug, suggesting a feature, or submitting a pull request, your help is appreciated.

1.  **Issues:** For bug reports and feature requests, please open an issue on our [GitHub repository](https://github.com/relaycoder/relaycode).
2.  **Pull Requests:**
    *   Fork the repository.
    *   Create a new branch for your feature or fix.
    *   Make your changes.
    *   Submit a pull request with a clear description of your changes.

This project uses `bun` for development. To get started, install the dependencies:
```bash
bun install
```

## License

This project is licensed under the **MIT License**. See the [LICENSE](https://github.com/relaycoder/relaycode/blob/main/LICENSE) file for details.
```
