/** The requested track, album or playlist page does not exist. */
export class Deezer404Exception extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'Deezer404Exception';
  }
}

/** Deezer served a logged-out page: the ARL cookie is missing, wrong or expired. */
export class Deezer403Exception extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'Deezer403Exception';
  }
}

/** Any other failure while talking to Deezer (network, unexpected response, API error). */
export class DeezerApiException extends Error {
  /** True when the failure looks like an expired session or license token. */
  public readonly sessionRelated: boolean;

  public constructor(message: string, options?: ErrorOptions & { sessionRelated?: boolean }) {
    super(message, options);
    this.name = 'DeezerApiException';
    this.sessionRelated = options?.sessionRelated ?? false;
  }
}

/** True for failures that a fresh session (new license token and cookies) may fix. */
export function isSessionError(error: unknown): boolean {
  return error instanceof Deezer403Exception || (error instanceof DeezerApiException && error.sessionRelated);
}
