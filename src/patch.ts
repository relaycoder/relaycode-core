import { FileOperation } from './types';
import { newUnifiedDiffStrategyService, multiSearchReplaceService, unifiedDiffService } from 'diff-apply';

const patchStrategies = {
  'new-unified': (p: { originalContent: string; diffContent: string; }) => {
    const service = newUnifiedDiffStrategyService.newUnifiedDiffStrategyService.create(0.95);
    return service.applyDiff(p);
  },
  'multi-search-replace': (p: { originalContent: string; diffContent: string; }) => {
    return multiSearchReplaceService.multiSearchReplaceService.applyDiff(p);
  },
  'unified': (p: { originalContent: string; diffContent: string; }) => {
    return unifiedDiffService.unifiedDiffService.applyDiff(p.originalContent, p.diffContent);
  },
};

export type ApplyOperationsResult = 
    | { success: true; newFileStates: Map<string, string | null> }
    | { success: false; error: string };

export const applyOperations = async (
    operations: FileOperation[],
    originalFiles: Map<string, string | null>
): Promise<ApplyOperationsResult> => {
    const fileStates = new Map<string, string | null>(originalFiles);

    for (const op of operations) {
        if (op.type === 'delete') {
            fileStates.set(op.path, null);
            continue;
        }
        if (op.type === 'rename') {
            const content = fileStates.get(op.from);
            if (content === undefined) {
                return { success: false, error: `Cannot rename non-existent or untracked file: ${op.from}` };
            }
            fileStates.set(op.from, null);
            fileStates.set(op.to, content);
            continue;
        }

        let finalContent: string;
        const currentContent = fileStates.get(op.path) ?? null;

        if (op.patchStrategy === 'replace') {
            finalContent = op.content;
        } else {
            if (currentContent === null && op.patchStrategy === 'multi-search-replace') {
                return { success: false, error: `Cannot use 'multi-search-replace' on a new file: ${op.path}` };
            }

            try {
                const diffParams = {
                    originalContent: currentContent ?? '',
                    diffContent: op.content,
                };
                
                const patcher = patchStrategies[op.patchStrategy as keyof typeof patchStrategies];
                if (!patcher) {
                    return { success: false, error: `Unknown patch strategy: '${op.patchStrategy}'` };
                }
                
                const result = await patcher(diffParams);
                if (result.success) {
                    finalContent = result.content;
                } else {
                    return { success: false, error: `Patch failed for ${op.path}: ${result.error}` };
                }
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                return { success: false, error: `Error applying patch for ${op.path} with strategy '${op.patchStrategy}': ${message}` };
            }
        }
        fileStates.set(op.path, finalContent);
    }

    return { success: true, newFileStates: fileStates };
};

const calculateLcsLength = (a: string[], b: string[]): number => {
    let s1 = a;
    let s2 = b;
    if (s1.length < s2.length) {
        [s1, s2] = [s2, s1];
    }
    const m = s1.length;
    const n = s2.length;
    
    const dp = Array(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
        let prev = 0;
        for (let j = 1; j <= n; j++) {
            const temp = dp[j];
            if (s1[i - 1] === s2[j - 1]) {
                dp[j] = prev + 1;
            } else {
                dp[j] = Math.max(dp[j], dp[j - 1]);
            }
            prev = temp;
        }
    }
    return dp[n];
};

export const calculateLineChanges = (
    op: FileOperation,
    originalFiles: Map<string, string | null>,
    newFiles: Map<string, string | null>
): { added: number; removed: number } => {
    if (op.type === 'rename') {
        return { added: 0, removed: 0 };
    }
    const oldContent = originalFiles.get(op.path) ?? null;

    if (op.type === 'delete') {
        const oldLines = oldContent ? oldContent.split('\n') : [];
        return { added: 0, removed: oldLines.length };
    }
    
    const newContent = newFiles.get(op.path) ?? null;

    if (oldContent === newContent) return { added: 0, removed: 0 };

    const oldLines = oldContent?.split('\n') ?? [];
    const newLines = newContent?.split('\n') ?? [];

    if (oldContent === null || oldContent === '') return { added: newLines.length, removed: 0 };
    if (newContent === null || newContent === '') return { added: 0, removed: oldLines.length };
    
    const lcsLength = calculateLcsLength(oldLines, newLines);
    return {
        added: newLines.length - lcsLength,
        removed: oldLines.length - lcsLength,
    };
};