/** First choice saves in place; choosing the saved status again advances. */
export function cueRatingDestination(
  cueIds: string[],
  currentIndex: number,
  assessments: Record<string, string>,
  selectedStatus: string,
): number | null {
  const currentId = cueIds[currentIndex];
  if (!currentId || assessments[currentId] !== selectedStatus || cueIds.length < 2) return null;
  const following = cueIds.findIndex((id, index) => index > currentIndex && !assessments[id]);
  if (following >= 0) return following;
  const wrapped = cueIds.findIndex((id) => !assessments[id]);
  return wrapped >= 0 ? wrapped : (currentIndex + 1) % cueIds.length;
}
