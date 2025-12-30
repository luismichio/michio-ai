// Web Worker for TensorFlow.js RAG
// Using Universal Sentence Encoder for embeddings

let modelPromise: any = null;

async function getModel() {
    if (modelPromise) return modelPromise;
    
    try {
        console.log("[RAG Worker] Loading TensorFlow.js...");
        
        // Import TensorFlow.js and Universal Sentence Encoder
        const tf = await import('@tensorflow/tfjs');
        const use = await import('@tensorflow-models/universal-sentence-encoder');
        
        console.log("[RAG Worker] Loading Universal Sentence Encoder model...");
        modelPromise = use.load();
        
        const model = await modelPromise;
        console.log("[RAG Worker] Model loaded successfully!");
        return model;
    } catch (err) {
        console.error("[RAG Worker] Failed to load model:", err);
        modelPromise = null;
        throw err;
    }
}

// Listen for messages from the main thread
self.onmessage = async (event) => {
    const { id, text } = event.data;

    try {
        const model = await getModel();
        
        // Generate embedding
        const embeddings = await model.embed([text]);
        const embeddingArray = await embeddings.array();
        const embedding = embeddingArray[0]; // Get first (and only) result
        
        // Clean up tensor to avoid memory leaks
        embeddings.dispose();

        // Send results back
        self.postMessage({ id, embedding });
    } catch (err: any) {
        console.error("[RAG Worker] Runtime Error:", err);
        self.postMessage({ id, error: String(err.message || err) });
    }
};
