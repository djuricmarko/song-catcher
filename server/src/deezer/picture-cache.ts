type PendingPicture = Promise<Buffer | undefined>;

/**
 * Small LRU cache of album covers, keyed by picture id.
 *
 * It stores the in-flight promise rather than the finished buffer, so workers
 * that download songs of the same album at the same time share one request.
 */
export class PictureCache {
  private readonly entries = new Map<string, PendingPicture>();

  public constructor(private readonly capacity: number) {}

  /** Returns the cached picture, or starts `load` and caches its promise. */
  public get(pictureId: string, load: () => PendingPicture): PendingPicture {
    const cached = this.entries.get(pictureId);
    if (cached) {
      // A Map iterates in insertion order; re-inserting marks the entry as recently used.
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
