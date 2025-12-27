const https = require('https');

const apiKey = process.argv[2];
if (!apiKey) {
  console.error("Please provide API key");
  process.exit(1);
}

console.log("Querying API for available models...");
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.error) {
        console.error("\nAPI returned an error:");
        console.error("Code:", json.error.code);
        console.error("Message:", json.error.message);
        console.error("Status:", json.error.status);
      } else if (json.models) {
        console.log("\nSuccess! Available Models for this key:");
        json.models.forEach(m => {
          if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
             console.log(`- ${m.name.replace('models/', '')}`);
          }
        });
      } else {
        console.log("\nNo models found. Full response:", json);
      }
    } catch (e) {
      console.error("Failed to parse response:", e.message);
    }
  });
}).on('error', (e) => {
  console.error("Network error:", e.message);
});
