// Confirmed syllabus facts can refine course policy without mutating the
// semester schema. Unmatched or merely extracted candidates have no effect.
export function effectiveCourse(course, overlay) {
  const facts = Object.values(overlay?.courseFacts || {})
    .filter((fact) => fact.courseId === course.id && fact.confirmedAt && !fact.deletedAt)
    .sort((a, b) => a.confirmedAt - b.confirmedAt);
  let latePolicy = course.latePolicy;
  const groups = (course.groups || []).map((group) => ({ ...group }));
  for (const fact of facts) {
    if (fact.kind === 'latePolicy' && ['never', 'penalty'].includes(fact.value?.status)) {
      latePolicy = { ...latePolicy, ...fact.value, source: fact.source };
    }
    if (fact.kind === 'dropRule' && fact.groupId) {
      const group = groups.find((entry) => entry.id === fact.groupId);
      if (group && Number.isInteger(fact.value?.countRequired) && Number.isInteger(fact.value?.countTotal)
          && fact.value.countRequired <= fact.value.countTotal) {
        group.countRequired = fact.value.countRequired;
        group.countTotal = fact.value.countTotal;
        group.policySource = fact.source;
      }
    }
  }
  return { ...course, latePolicy, groups, groupsById: new Map(groups.map((group) => [group.id, group])) };
}
