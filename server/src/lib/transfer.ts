export interface TransferSample {
  bytes: number;
  elapsedMs: number;
  fraction: number | null;
}

export type TransferReporter = (sample: TransferSample) => void;

export function cumulativeTransfer(report: TransferReporter): (transferred: number, total?: number) => void {
  let last: { bytes: number; at: number } | undefined;
  return (transferred, total) => {
    const at = Date.now();
    const previous = last;
    const continues = previous !== undefined && transferred >= previous.bytes;
    report({
      bytes: continues ? transferred - previous.bytes : 0,
      elapsedMs: continues ? at - previous.at : 0,
      fraction: total ? Math.min(1, transferred / total) : null,
    });
    last = { bytes: transferred, at };
  };
}
