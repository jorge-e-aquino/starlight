export const REVIEW_INTERVAL_DAYS = [1, 2, 4, 7];

export function topicOrder(topics, reviews = [], now = Date.now()) {
  const last = new Map();
  reviews.forEach((review) => {
    if (!last.has(review.topicId) || last.get(review.topicId).at < review.at) last.set(review.topicId, review);
  });
  return topics.slice().sort((a, b) => {
    const ar = last.get(a.id), br = last.get(b.id);
    const adue = ar ? ar.at + REVIEW_INTERVAL_DAYS[ar.rating] * 86400000 : 0;
    const bdue = br ? br.at + REVIEW_INTERVAL_DAYS[br.rating] * 86400000 : 0;
    const aReady = adue <= now ? 0 : 1, bReady = bdue <= now ? 0 : 1;
    return aReady - bReady || (a.confidence ?? -1) - (b.confidence ?? -1) || adue - bdue || a.title.localeCompare(b.title);
  });
}

export function coverage(topics) {
  return {
    unchecked: topics.filter((topic) => topic.confidence == null).length,
    shaky: topics.filter((topic) => (topic.confidence ?? 3) <= 1).length,
    steady: topics.filter((topic) => topic.confidence >= 2).length
  };
}

function sentences(text) {
  return String(text).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 30 && sentence.length <= 400);
}

export function practiceQuestions(topic, materials, limit = 3) {
  const terms = (topic.title.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((term) => !['the', 'and', 'for', 'with'].includes(term));
  const hits = [];
  for (const source of materials) {
    String(source.text || '').split('\f').forEach((page, index) => {
      sentences(page).forEach((sentence) => {
        if (!terms.length || !terms.every((term) => new RegExp(`\\b${term}\\b`, 'i').test(sentence))) return;
        if (hits.some((hit) => hit.answer === sentence)) return;
        hits.push({ topicId: topic.id, question: `What does this material say about ${topic.title}?`,
          answer: sentence, source: source.name, page: index + 1 });
      });
    });
  }
  return hits.slice(0, limit);
}
