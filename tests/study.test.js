import assert from 'node:assert/strict';
import { topicOrder, coverage, practiceQuestions } from '../src/study.js';
import { samplePracticeFor } from '../src/sample-practice.js';

const topics = [
  { id: 'inflation', title: 'Inflation', confidence: 2 },
  { id: 'gdp', title: 'GDP', confidence: 0 },
  { id: 'unemployment', title: 'Unemployment', confidence: null }
];
const now = new Date(2026, 8, 21, 12).getTime();
const reviews = [{ id: 'r1', topicId: 'gdp', rating: 3, at: now - 86400000 }];
assert.deepEqual(topicOrder(topics, reviews, now).map((topic) => topic.id), ['unemployment', 'inflation', 'gdp']);
assert.deepEqual(coverage(topics), { unchecked: 1, shaky: 1, steady: 1 });
const materials = [{ name: 'Lecture 4.pdf', text: 'Page one unrelated content.\fGDP is the total market value of final goods and services in an economy. GDP growth can be compared over time.' }];
const questions = practiceQuestions(topics[1], materials);
assert.ok(questions.length > 0);
assert.equal(questions[0].source, 'Lecture 4.pdf');
assert.equal(questions[0].page, 2);
assert.ok(questions[0].answer.includes('total market value'));
assert.deepEqual(practiceQuestions({ id: 'other', title: 'Fiscal multiplier' }, materials), []);
const sample = samplePracticeFor('mgt2250-test1');
assert.equal(sample.questions.length, 6);
assert.ok(sample.questions.every(({ prompt, answer, page }) => prompt && answer && page));
assert.match(sample.document, /gatech\.instructure\.com\/courses\/531522\/files\/75751069/);
assert.equal(samplePracticeFor('mgt2250-test2'), null);
console.log('Topic review and source-grounded practice checks pass.');
