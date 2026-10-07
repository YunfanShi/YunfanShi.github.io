type SignedLink = { path: string | null; signedUrl: string | null; error: string | null };

type LinkStorage = {
  createSignedUrls(paths: string[], expiresIn: number): Promise<{
    data: SignedLink[] | null;
    error: unknown;
  }>;
};

/** Call only with paths authorized for the current request; never cache across users. */
export async function getNovelSignedLinks(storage: LinkStorage, authorizedPaths: string[]): Promise<Map<string, string>> {
  const paths = [...new Set(authorizedPaths.filter(Boolean))];
  const links = new Map<string, string>();
  for (let offset = 0; offset < paths.length; offset += 100) {
    const batch = paths.slice(offset, offset + 100);
    const requested = new Set(batch);
    const result = await storage.createSignedUrls(batch, 3600);
    if (result.error) continue;
    for (const entry of result.data ?? []) {
      if (entry.path && requested.has(entry.path) && !entry.error && entry.signedUrl) {
        links.set(entry.path, entry.signedUrl);
      }
    }
  }
  return links;
}
