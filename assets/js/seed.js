import { Store } from './store.js';

export function seedIfEmpty() {
  if (localStorage.getItem(Store.KEYS.seeded)) return;
  localStorage.setItem(Store.KEYS.seeded, '1');
  if (Store.listSurveys().length) return;

  const survey = Store.createSurvey({
    title: 'Customer Feedback',
    description: 'A short survey covering many of the supported question types.',
  });

  const questions = [
    { type: 'text', label: 'What is your full name?', required: true, placeholder: 'Jane Doe' },
    { type: 'email', label: 'What is your email address?', required: true, placeholder: 'jane@example.com' },
    { type: 'password', label: 'Set a portal password', help: 'At least 8 characters.', minLength: 8 },
    { type: 'tel', label: 'Phone number', placeholder: '+1 555 000 1234' },
    { type: 'url', label: 'Company website', placeholder: 'https://example.com' },
    { type: 'number', label: 'How many people are on your team?', min: 1, max: 500, step: 1 },
    { type: 'range', label: 'How likely are you to recommend us?', help: '0 = not likely, 10 = very likely', min: 0, max: 10, step: 1 },
    { type: 'date', label: 'When did you start using our product?' },
    { type: 'time', label: 'Best time to reach you' },
    { type: 'color', label: 'Pick a brand color you associate with us' },
    { type: 'select', label: 'Which plan are you on?', options: [
      { id: 'o1', label: 'Free', value: 'free' }, { id: 'o2', label: 'Pro', value: 'pro' }, { id: 'o3', label: 'Enterprise', value: 'enterprise' },
    ] },
    { type: 'radio', label: 'How did you hear about us?', required: true, options: [
      { id: 'o1', label: 'Search engine', value: 'search' }, { id: 'o2', label: 'Friend', value: 'friend' }, { id: 'o3', label: 'Social media', value: 'social' },
    ] },
    { type: 'checkbox-group', label: 'Which features do you use?', options: [
      { id: 'o1', label: 'Reporting', value: 'reporting' }, { id: 'o2', label: 'Integrations', value: 'integrations' }, { id: 'o3', label: 'Automation', value: 'automation' },
    ] },
    { type: 'checkbox', label: 'Agree to receive updates', placeholder: 'Yes, email me product updates' },
    { type: 'textarea', label: 'Anything else you would like to share?', rows: 4, placeholder: 'Tell us more…' },
    { type: 'file', label: 'Attach a screenshot (optional)', accept: 'image/*' },
  ];

  questions.forEach((q) => Store.createQuestion(survey.id, q));

  Store.createSurvey({ title: 'Event Registration', description: 'Collects attendee details for an upcoming event.' });
  Store.createSurvey({ title: 'Product Satisfaction', description: 'Quick pulse survey sent after checkout.' });
}
