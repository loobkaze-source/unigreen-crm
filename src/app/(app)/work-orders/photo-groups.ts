/**
 * Site photos, gathered under their headings.
 *
 * The heading lives on each photo, so a group is just a run of photos that
 * name the same one. Runs are used rather than buckets so that the order the
 * technician arranged stays the order that prints — but equal names are pulled
 * together first, so a heading can never appear twice on the page.
 *
 * Photos with no heading keep a group of their own, printed without a title.
 */
export type PhotoGroup<T> = { name: string; photos: T[] };

export function groupPhotos<T extends { section: string }>(
  photos: T[]
): PhotoGroup<T>[] {
  const groups: PhotoGroup<T>[] = [];
  for (const photo of photos) {
    const name = photo.section.trim();
    const home = groups.find((g) => g.name === name);
    if (home) home.photos.push(photo);
    else groups.push({ name, photos: [photo] });
  }
  return groups;
}

/** The same grouping flattened back out — the order the photos should be in. */
export function flattenGroups<T extends { section: string }>(photos: T[]): T[] {
  return groupPhotos(photos).flatMap((g) => g.photos);
}
