
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import * as cheerio from 'cheerio';

export const POST = auth(async function POST(req) {
  // if (!req.auth) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ message: "No URL provided" }, { status: 400 });

    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch URL: ${res.statusText}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove scripts, styles, etc.
    $('script').remove();
    $('style').remove();
    $('nav').remove();
    $('footer').remove();
    $('iframe').remove();
    $('noscript').remove();

    // Extract content
    // Priority: article > main > body
    let content = "";
    
    // Youtube Specific (Description)
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        // Simple meta extraction for YouTube
        const description = $('meta[name="description"]').attr('content') || "";
        const title = $('meta[name="title"]').attr('content') || $('title').text();
        content = `VIDEO TITLE: ${title}\n\nDESCRIPTION: ${description}`;
    } else {
        // Standard Web Page
        if ($('article').length) {
            content = $('article').text();
        } else if ($('main').length) {
            content = $('main').text();
        } else {
            content = $('body').text();
        }
    }

    // Clean up whitespace
    // Replace multiple newlines with double newline to preserve paragraphs-ish
    // Replace multiple spaces with single space
    const cleanContent = content
        .replace(/\s+/g, ' ') // Flatten to single line first? No, we want paragraphs.
        .trim();
    
    // Better cleaning:
    // 1. Get raw text but try to preserve block elements?
    // Cheerio .text() flattens everything.
    // Let's try to be a bit smarter if needed, but for now simple text is okay for summarization.
    
    // Re-clean:
    // If we just use .text(), we lose paragraph breaks often depending on HTML structure.
    // Optimization: Add newlines to block elements before extracting text?
    $('p, div, br, h1, h2, h3, h4, h5, h6, li').prepend('\n');
    
    // Re-extract with newlines injected
    let betterContent = "";
     if (url.includes('youtube.com') || url.includes('youtu.be')) {
         // Keep the meta extraction
         betterContent = content; 
     } else {
         if ($('article').length) {
             betterContent = $('article').text();
         } else if ($('main').length) {
             betterContent = $('main').text();
         } else {
             betterContent = $('body').text();
         }
     }
    
    const finalContent = betterContent
        .replace(/\n\s+\n/g, '\n\n') // Collapse multiple empty lines
        .replace(/[ \t]+/g, ' ')     // Collapse spaces
        .trim();

    // Get Title
    const title = $('title').text().trim() || url;

    return NextResponse.json({ 
        title, 
        content: finalContent,
        originalUrl: url
    });

  } catch (error: any) {
    console.error("Fetch URL Error:", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
});
