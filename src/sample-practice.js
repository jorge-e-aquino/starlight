// Original recall prompts based on the instructor's answered sample set.
// They describe the sample, not a confirmed inventory of exam topics.
const announcement = 'https://gatech.instructure.com/courses/531522/discussion_topics/2655655';
const document = 'https://gatech.instructure.com/courses/531522/files/75751069?wrap=1';

const testOne = [
  {
    title: 'See the shape', page: '1–3',
    prompt: 'A histogram looks different when its bins get wider. What should you check before describing its shape?',
    answer: 'Check the same data at both widths. Wider bins can hide a cluster. In the sample, the narrow bins reveal several popular engine sizes. The mean gives a balance point, while standard deviation describes spread.'
  },
  {
    title: 'Read a two-way table', page: '3',
    prompt: 'A mall kiosk finds different reactions to a phone across two groups. What does Cramér’s V tell you, and what does it leave open?',
    answer: 'V describes the strength of the association in the table. It does not show why the groups differ. Who stopped at the kiosk, their age, and when they visited could affect the result.'
  },
  {
    title: 'Interpret correlation', page: '4',
    prompt: 'Eight clerks have a correlation near zero between entries and errors. If entries change from single units to hundreds, what happens to r?',
    answer: 'The correlation stays the same under a positive change of units. A value near zero gives little evidence of a linear relationship here, so the data do not support a claim that more entries make clerks tired.'
  },
  {
    title: 'Notice capped values', page: '5–6',
    prompt: 'Several home values are all recorded at the same maximum. What should you notice before trusting the scatterplot and correlation?',
    answer: 'Those values were capped. Plotting their uncapped values changes the apparent pattern and the correlation. Either version measures association; neither proves that crime causes a change in home value.'
  },
  {
    title: 'Compare association strength', page: '7',
    prompt: 'A gasoline-purchase table has a chi-squared value of 6.52 and Cramér’s V of 0.09. What is the useful plain-language reading?',
    answer: 'The effect-size measure V is small, so the sample shows a weak association between purchase day and gasoline type. Read the table and context along with a chi-squared value.'
  },
  {
    title: 'Check influential points', page: '7–8',
    prompt: 'A CO₂-versus-GDP scatterplot has r about 0.64, then about 0.93 after two unusual points are removed. What should you report?',
    answer: 'Show the scatterplot and explain both calculations. Those points strongly affect the summary. The remaining data have a stronger positive linear association, but removing points needs a reason and does not prove causation.'
  }
];

export function samplePracticeFor(examId) {
  if (examId !== 'mgt2250-test1') return null;
  return { title: 'Instructor sample questions', announcement, document, questions: testOne };
}
