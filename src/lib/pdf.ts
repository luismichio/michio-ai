// Configure PDF.js worker
const PDFJS_VERSION = '5.4.530';

/**
 * Extracts all text content from a PDF ArrayBuffer.
 */
export async function extractTextFromPdf(data: ArrayBuffer): Promise<string> {
    // Dynamic import to avoid SSR crashes with DOMMatrix/Canvas
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

    try {
        const loadingTask = pdfjsLib.getDocument({ data });
        const pdf = await loadingTask.promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Extract text items and join them
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(" ");
            
            fullText += `--- Page ${i} ---\n${pageText}\n\n`;
        }

        return fullText.trim();
    } catch (error) {
        console.error("PDF Extraction Error:", error);
        throw new Error("Failed to extract text from PDF");
    }
}
