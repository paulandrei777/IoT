require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('GEMINI_API_KEY is missing in .env');
  process.exit(1);
}

const listModels = async () => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(API_KEY)}`;

  const res = await fetch(endpoint);
  const payload = await res.json();

  if (!res.ok) {
    console.error('Failed to list models:', payload);
    process.exit(1);
  }

  const models = Array.isArray(payload.models) ? payload.models : [];

  console.log(`Found ${models.length} model(s):`);
  for (const model of models) {
    const methods = Array.isArray(model.supportedGenerationMethods)
      ? model.supportedGenerationMethods.join(', ')
      : 'none';
    console.log(`- ${model.name} | methods: ${methods}`);
  }

  const generative = models.filter((m) =>
    Array.isArray(m.supportedGenerationMethods) &&
    m.supportedGenerationMethods.includes('generateContent')
  );

  if (generative.length > 0) {
    console.log('\nRecommended generateContent model IDs:');
    for (const model of generative) {
      const shortName = (model.name || '').replace(/^models\//, '');
      console.log(`- ${shortName}`);
    }
  }
};

listModels().catch((err) => {
  console.error('Unexpected error while listing models:', err.message || err);
  process.exit(1);
});
