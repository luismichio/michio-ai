const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.join(__dirname, '..', '.env.local');
let apiKey = '';

try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/GEMINI_API_KEY=(.*)/);
    if (match && match[1]) {
        apiKey = match[1].trim().replace(/^["']|["']$/g, '');
    }
} catch (e) {
    console.error("Could not read .env.local");
}

if (!apiKey) {
    console.error("No GEMINI_API_KEY found in .env.local");
    process.exit(1);
}

// Fetch models directly using fetch (Node 18+)
async function listModels() {
  try {
      console.log("Fetching available models using Key: " + apiKey.substring(0, 5) + "...");
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      
      if (!response.ok) {
          throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.models) {
          console.log("\nAvailable Models:");
          data.models.forEach(m => {
              if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
                  console.log(`- ${m.name}`);
              } else {
                   console.log(`- ${m.name} (Not supported for generateContent)`);
              }
          });
      } else {
          console.log("No models found. Response:", data);
      }

  } catch (error) {
    console.error("Error listing models:", error);
  }
}

listModels();
