// This file will be used for custom PDF extraction with robust fallback options

/**
 * Enhanced PDF text extraction module
 * Includes fallbacks and error handling for various PDF formats
 */

import { createWorker } from 'tesseract.js';

// Create a function to determine if we're in a browser environment
const isBrowser = () => {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
};

// Create a custom PDF extraction utility
export const extractTextFromPDF = async (pdfData) => {
  try {
    console.log('==================== PDF EXTRACTION START ====================');
    console.log(`PDF Buffer Size: ${pdfData.byteLength} bytes`);
    
    // Check if pdfData is valid
    if (!pdfData || pdfData.byteLength === 0) {
      console.log('ERROR: Invalid PDF data (empty or null)');
      throw new Error('Invalid PDF data: Empty or null');
    }
    
    // Dynamic import to avoid loading PDF.js on the server unnecessarily
    console.log('Importing PDF.js library...');
    const pdfjsLib = await import('pdfjs-dist');
    console.log('PDF.js library loaded successfully');
    
    // Critical for server environment - disable worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    console.log('PDF.js worker disabled for server-side extraction');
    
    // Load the PDF document with robust error handling
    console.log('Creating PDF loading task with options...');
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfData),
      // These settings are critical for serverless environments
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
      cMapUrl: undefined,
      cMapPacked: true,
      standardFontDataUrl: undefined,
      // Add additional params to better handle various PDF formats
      verbosity: 0,
      ignoreErrors: true,
      stopAtErrors: false,
      // Try force-disabling password/encryption check
      password: '',
    });
    
    console.log('PDF loading task created, setting up timeout...');
    // Add timeout to prevent hanging on problematic PDFs
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('PDF processing timeout')), 30000);
    });
    
    // Use Promise.race to implement timeout
    console.log('Loading PDF document (with 30s timeout)...');
    const pdf = await Promise.race([loadingTask.promise, timeoutPromise]);
    
    if (!pdf) {
      console.log('ERROR: PDF processing timed out');
      return 'PDF processing timed out. Please try with a different PDF format.';
    }
    
    // Extract text from each page
    let textContent = '';
    const numPages = pdf.numPages;
    console.log(`PDF loaded successfully with ${numPages} pages`);
    
    // Process pages with individual try/catch blocks to continue even if some pages fail
    let textFoundInAnyPage = false;
    let totalTextLength = 0;
    
    for (let i = 1; i <= Math.min(numPages, 20); i++) {
      try {
        console.log(`Processing page ${i}/${numPages}...`);
        const page = await pdf.getPage(i);
        console.log(`Page ${i} loaded, attempting text extraction...`);
        
        // Try enhanced text extraction with better parameters
        const textContentOptions = {
          normalizeWhitespace: true,
          disableCombineTextItems: false
        };
        const pageContent = await page.getTextContent(textContentOptions);
        
        console.log(`Page ${i} text content extracted: ${pageContent.items.length} items`);
        
        // Improved text extraction with better spacing handling
        let lastY;
        const pageText = pageContent.items
          .map((item, index) => {
            // Add line breaks for significant position changes
            const text = item.str;
            if (lastY && Math.abs(lastY - item.transform[5]) > 10) {
              lastY = item.transform[5];
              return `\n${text}`;
            }
            lastY = item.transform[5];
            return text;
          })
          .join(' ')
          .replace(/\s+/g, ' ') // Normalize spaces
          .trim();
          
        // Log a portion of the extracted text for debugging
        const previewText = pageText.substring(0, 50) + (pageText.length > 50 ? '...' : '');
        console.log(`Page ${i} formatted text preview: "${previewText}"`);
        
        // If we found meaningful text content
        if (pageText.length > 50) {
          textFoundInAnyPage = true;
          totalTextLength += pageText.length;
        }
        
        textContent += `--- Page ${i} ---\n${pageText}\n\n`;
      } catch (pageError) {
        console.error(`ERROR: Page ${i} extraction failed:`, pageError);
        textContent += `--- Page ${i} ---\nError extracting text from this page.\n\n`;
      }
    }
    
    if (numPages > 20) {
      console.log('Page limit reached (20), truncating additional pages');
      textContent += `\n(Note: Only the first 20 pages were processed due to size limitations.)\n`;
    }
    
    // If no meaningful text was found in any page or very little text was found, try OCR as fallback
    if (!textFoundInAnyPage || totalTextLength < 500) {
      console.log('WARNING: Minimal text extracted - likely a scanned document without OCR');
      console.log('Attempting OCR fallback...');
      
      try {
        // We need to check if we're running in a browser environment for canvas support
        // Node.js environments in serverless functions don't support canvas natively
        console.log('Checking environment for canvas support...');
        
        // Direct OCR approach for Node.js serverless environment
        // Convert the PDF to an image buffer first if possible
        console.log('Performing direct OCR on PDF data...');
        const worker = await createWorker({
          // Enable debug logging for Tesseract
          logger: m => console.log(`OCR Log: ${m.status} (${Math.floor(m.progress * 100)}%)`),
          // Improve OCR parameters for invoices
          engineMode: 'tesseract',
          // Focus on English text recognition for invoices
          langPath: 'https://tessdata.projectnaptha.com/4.0.0',
          lang: 'eng',
          // Advanced configuration
          tessedit_ocr_engine_mode: 3, // Legacy + LSTM engines
          tessjs_create_pdf: '0',  // Disable PDF output
          tessjs_create_hocr: '0', // Disable HOCR output
        });
        
        // Set recognition parameters
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:-$%/ ()', 
        });
        
        // Create a binary blob from the original PDF buffer for Tesseract to try directly
        const pdfBlob = new Blob([new Uint8Array(pdfData)], { type: 'application/pdf' });
        
        console.log('Starting OCR text recognition on PDF...');
        const result = await worker.recognize(pdfBlob);
        
        // Get the extracted text
        const ocrText = result.data.text;
        
        console.log('OCR completed successfully on PDF');
        if (result.data.confidence) {
          console.log(`OCR confidence: ${result.data.confidence.toFixed(2)}%`);
        }
        
        await worker.terminate();
        
        // Add OCR results to our extraction
        textContent = `=== OCR TEXT FROM PDF (SCANNED DOCUMENT) ===\n\n${ocrText}\n\n${textContent}`;
        textFoundInAnyPage = true;
        
      } catch (ocrError) {
        console.error('OCR fallback failed:', ocrError);
        textContent = `It seems this PDF is a scanned document without OCR (Optical Character Recognition) applied. The system attempted to perform OCR but encountered issues.

To process this invoice, you have two options:

1. Upload a clearer version where text is selectable
2. Convert this PDF using an OCR tool like Adobe Acrobat, Google Drive, or online converters
3. Manually enter the invoice details

Or you can manually enter these key invoice details:
- Invoice Number
- Invoice Date
- Total Amount
- Vendor or Company Name
- Line Items (Products/Services, Quantity, Price)
- Tax Information (if applicable)

${textContent}`;
      }
    }
    
    console.log(`PDF extraction complete: Total characters: ${textContent.length}`);
    console.log('==================== PDF EXTRACTION COMPLETE ====================');
    
    return textContent;
    
  } catch (error) {
    console.error('==================== PDF EXTRACTION FAILED ====================');
    console.error(`Error type: ${error.name}`);
    console.error(`Error message: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);
    
    // Add better fallback message
    try {
      // Return a more user-friendly error message with clear next steps
      return `It seems there was an issue extracting the text from your PDF invoice. This can happen if the invoice is scanned as an image without OCR (Optical Character Recognition) applied, or if it is password-protected or in an unsupported format.

Here's how you can proceed:

Option 1: Upload a Clearer Version
Try uploading a high-quality version of the invoice where text is selectable. If your invoice is scanned, you can use OCR software to convert it into machine-readable text.

Option 2: Manual Entry
If uploading a new version isn't possible, you can manually provide the following key details:
- Invoice Number
- Invoice Date
- Total Amount
- Vendor or Company Name
- Line Items (Products/Services, Quantity, Price)
- Tax Information (if applicable)

Option 3: Convert the Invoice
If the PDF is password-protected or encrypted, you may need to remove the password. You can also try converting the PDF to a Word document or plain text format using tools like Adobe Acrobat, SmallPDF, or online converters.

Original error: ${error.message}`;
    } catch (fallbackError) {
      console.error('Fallback error handling failed:', fallbackError);
      return `Error: All PDF extraction methods failed. Please try uploading a different format or manually enter the invoice details.`;
    }
  }
};

export default extractTextFromPDF; 