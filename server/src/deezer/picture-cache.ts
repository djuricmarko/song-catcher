type PendingPicture = Promise<Buffer | undefined>;

export class PictureCache {
  private readonly entries = new Map<string, PendingPicture>();

  public constructor(private readonly capacity: number) {}

  public get(pictureId: string, load: () => PendingPicture): PendingPicture {
    const cached = this.entries.get(pictureId);
    if (cached) {
      this.entries.delete(pictureId);
      this.entries.set(pictureId, cached);
      return cached;
    }

    const pending = load();
    this.entries.set(pictureId, pending);
    this.evictOldest();
    return pending;
  }

  public delete(pictureId: string): void {
    this.entries.delete(pictureId);
  }

  private evictOldest(): void {
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        return;
      }
      this.entries.delete(oldest);
    }
  }
}
