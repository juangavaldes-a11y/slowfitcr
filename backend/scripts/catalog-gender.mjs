const genderTags = new Set(["men", "women", "unisex"]);

const sourceTags = new Map([
  ["260228Unisex Daily-MIGE SPORTS.pdf", ["men", "women"]],
  ["260714MIGE SPORTS - MEN.pdf", ["men"]],
  ["260728Seamless - MIGE SPORTS.pdf", ["women"]],
  ["260813Non-Seamless - MIGE SPORTS.pdf", ["women"]],
  ["MATCHING SET - Non-Seamless - MIGE SPORTS.pdf", ["women"]],
]);

export function genderTagsForSource(sourceFile) {
  const assignedTags = sourceTags.get(sourceFile);
  if (!assignedTags) {
    throw new Error(`Unknown catalog gender for source document: ${sourceFile || "missing source"}`);
  }
  return assignedTags;
}

export function mergeCatalogGenderTags(currentTags, sourceFile) {
  return [
    ...currentTags.filter((tag) => !genderTags.has(tag)),
    ...genderTagsForSource(sourceFile),
  ];
}