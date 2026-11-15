export class Deezer404Exception extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'Deezer404Exception';
  }
}

export class Deezer403Exception extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'Deezer403Exception';
  }
}

export class DeezerApiException extends Error {
  public readonly sessionRelated: boolean;

  public constructor(message: string, options?: ErrorOptions & { sessionRelated?: boolean }) {
    super(message, options);
    this.name = 'DeezerApiException';
    this.sessionRelated = options?.sessionRelated ?? false;
  }
}

export function isSessionError(error: unknown): boolean {
  return error instanceof Deezer403Exception || (error instanceof DeezerApiException && error.sessionRelated);
}
