import { NextResponse } from 'next/server'
import { createAzureAuthHeaders, getAzureOpenAIEndpoint } from '@/lib/azure'
import { createWorker } from 'tesseract.js'

// Define types for message content structures
interface Message {
  role: string;
  content: string;
}

// Helper function to extract text from PDF buffer
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    // Only import PDF.js when actually processing a PDF
    // PDF.js Node.js polyfills
    // @ts-ignore - Polyfill for DOMMatrix which is browser-only
    global.DOMMatrix = class {
      a: number; b: number; c: number; d: number; e: number; f: number;
      
      constructor(transform?: number[]) {
        if (transform) {
          this.a = transform[0];
          this.b = transform[1];
          this.c = transform[2];
          this.d = transform[3];
          this.e = transform[4];
          this.f = transform[5];
        } else {
          this.a = 1; this.d = 1;
          this.b = 0; this.c = 0; this.e = 0; this.f = 0;
        }
      }
    };
    
    // Dynamically import PDF.js only when needed
    const pdfjsLib = await import('pdfjs-dist');
    
    // Load the PDF document using the binary data without worker
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      // Disable worker to prevent issues in server environment
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true
    });
    
    const pdf = await loadingTask.promise;
    
    let extractedText = '';
    
    // Get total number of pages
    const numPages = pdf.numPages;
    console.log(`PDF loaded with ${numPages} pages`);
    
    // Extract text from each page
    for (let i = 1; i <= Math.min(numPages, 20); i++) { // Limit to 20 pages to prevent timeouts
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Concatenate the text items
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        
        extractedText += `--- Page ${i} ---\n${pageText}\n\n`;
      } catch (pageError) {
        console.error(`Error extracting text from PDF page ${i}:`, pageError);
        extractedText += `--- Page ${i} ---\nError extracting text from this page.\n\n`;
      }
    }
    
    if (numPages > 20) {
      extractedText += `\n(Note: Only the first 20 pages were processed due to size limitations.)\n`;
    }
    
    return extractedText.trim() || 'No text could be extracted from this PDF.';
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return 'Error extracting text from PDF. This PDF may be encrypted, damaged, or in a format that cannot be processed.';
  }
}

// Helper function to detect if text appears to be an invoice
function detectInvoiceContent(text: string, fileName: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerFileName = fileName.toLowerCase();
  
  // Check filename
  if (lowerFileName.includes('invoice') || lowerFileName.includes('receipt')) {
    return true;
  }
  
  // Check content keywords common in invoices
  const invoiceKeywords = [
    'invoice', 'receipt', 'bill to', 'ship to', 
    'payment terms', 'due date', 'invoice number',
    'order number', 'customer id', 'tax', 'total',
    'subtotal', 'amount due', 'payment', 'qty', 'quantity',
    'unit price', 'description', 'item', 'service',
    'account number', 'invoice date', 'po number'
  ];
  
  return invoiceKeywords.some(keyword => lowerText.includes(keyword));
}

export async function POST(request: Request) {
  try {
    let messages: Message[];
    let hasFile = false;
    let fileType;
    let fileName = '';
    
    // Check if request is multipart/form-data (has file) or JSON
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Handle FormData with file
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const messagesJson = formData.get('messages') as string;
      
      // Parse the messages from the form data
      messages = messagesJson ? JSON.parse(messagesJson) : [];
      
      if (file) {
        hasFile = true;
        fileName = file.name;
        fileType = file.type;
        const fileBuffer = await file.arrayBuffer();
        
        // Get the last user message
        const lastMessage = messages[messages.length - 1];
        
        if (lastMessage && lastMessage.role === 'user') {
          // Handle different file types
          if (fileType.startsWith('image/')) {
            // Always perform OCR for images (critical for invoices)
            try {
              console.log('Performing OCR on image...');
              // Create a binary blob from the buffer for Tesseract
              const blob = new Blob([new Uint8Array(fileBuffer)], { type: fileType });
              
              // Create a worker and recognize text from the image
              const worker = await createWorker();
              const result = await worker.recognize(blob);
              const extractedText = result.data.text;
              await worker.terminate();
              
              console.log('OCR completed successfully');
              
              // Format the text extraction results
              const textContent = typeof lastMessage.content === 'string' ? lastMessage.content : '';
              let updatedMessage = '';
              
              if (textContent) {
                updatedMessage = `${textContent}\n\n--- OCR TEXT FROM ${fileName.toUpperCase()} ---\n${extractedText}`;
              } else {
                updatedMessage = `OCR Text extracted from ${fileName}:\n${extractedText}`;
              }
              
              // If this appears to be an invoice, add a note for the AI
              if (detectInvoiceContent(extractedText, fileName)) {
                updatedMessage += "\n\nThis appears to be an invoice. Please extract relevant information such as:";
                updatedMessage += "\n- Invoice number";
                updatedMessage += "\n- Date";
                updatedMessage += "\n- Total amount";
                updatedMessage += "\n- Vendor/Company";
                updatedMessage += "\n- Line items";
                updatedMessage += "\n- Tax information";
              }
              
              // Replace the last message with the OCR text content
              messages[messages.length - 1] = {
                ...lastMessage,
                content: updatedMessage
              };
            } catch (ocrError) {
              console.error('OCR failed:', ocrError);
              
              // Even if OCR fails, we should still inform the user
              const textContent = typeof lastMessage.content === 'string' ? lastMessage.content : '';
              let updatedMessage = textContent ? 
                `${textContent}\n\nI tried to extract text from your image "${fileName}" but OCR failed.` :
                `I tried to extract text from your image "${fileName}" but OCR failed.`;
              
              // Replace the last message
              messages[messages.length - 1] = {
                ...lastMessage,
                content: updatedMessage
              };
            }
          } 
          else if (fileType === 'text/plain') {
            // For text files, extract the content and add it to the message
            const textContent = new TextDecoder().decode(new Uint8Array(fileBuffer));
            const userText = typeof lastMessage.content === 'string' ? lastMessage.content : '';
            
            let updatedMessage = '';
            if (userText) {
              updatedMessage = `${userText}\n\n--- TEXT FROM ${fileName.toUpperCase()} ---\n${textContent}`;
            } else {
              updatedMessage = `Text from ${fileName}:\n${textContent}`;
            }
            
            // If this appears to be an invoice, add a note for the AI
            if (detectInvoiceContent(textContent, fileName)) {
              updatedMessage += "\n\nThis appears to be an invoice. Please extract relevant information such as:";
              updatedMessage += "\n- Invoice number";
              updatedMessage += "\n- Date";
              updatedMessage += "\n- Total amount";
              updatedMessage += "\n- Vendor/Company";
              updatedMessage += "\n- Line items";
              updatedMessage += "\n- Tax information";
            }
            
            // Replace the last message with the updated text content
            messages[messages.length - 1] = {
              ...lastMessage,
              content: updatedMessage
            };
          }
          else if (fileType === 'application/pdf') {
            try {
              console.log('Extracting text from PDF...');
              
              // Extract text from the PDF using the updated function
              let extractedText = '';
              try {
                extractedText = await extractTextFromPDF(fileBuffer);
                console.log('PDF text extraction completed');
              } catch (pdfExtractError) {
                console.error('PDF extraction internal error:', pdfExtractError);
                extractedText = 'Error: PDF text extraction failed. The PDF might be encrypted or in an unsupported format.';
              }
              
              // Format the extracted text
              const userText = typeof lastMessage.content === 'string' ? lastMessage.content : '';
              let updatedMessage = '';
              
              if (userText) {
                updatedMessage = `${userText}\n\n--- EXTRACTED TEXT FROM PDF ${fileName.toUpperCase()} ---\n${extractedText}`;
              } else {
                updatedMessage = `Extracted text from PDF ${fileName}:\n${extractedText}`;
              }
              
              // If this appears to be an invoice, add a note for the AI
              if (detectInvoiceContent(extractedText, fileName)) {
                updatedMessage += "\n\nThis appears to be an invoice. Please extract relevant information such as:";
                updatedMessage += "\n- Invoice number";
                updatedMessage += "\n- Date";
                updatedMessage += "\n- Total amount";
                updatedMessage += "\n- Vendor/Company";
                updatedMessage += "\n- Line items";
                updatedMessage += "\n- Tax information";
              }
              
              // Replace the last message with the PDF text content
              messages[messages.length - 1] = {
                ...lastMessage,
                content: updatedMessage
              };
            } catch (pdfError) {
              console.error('PDF handling failed completely:', pdfError);
              
              // If PDF extraction fails completely, inform the user
              const userText = typeof lastMessage.content === 'string' ? lastMessage.content : '';
              const fileSizeKB = Math.round(file.size / 1024);
              
              let updatedMessage = userText ? 
                `${userText}\n\n` : 
                '';
                
              updatedMessage += `I've received your PDF file "${fileName}" (${fileSizeKB}KB) but had trouble extracting the text. This PDF might be encrypted, password-protected, or in a format that cannot be processed.`;
              
              // Replace the last message
              messages[messages.length - 1] = {
                ...lastMessage,
                content: updatedMessage
              };
            }
          }
          else {
            // For other file types, just mention the attachment
            const userText = typeof lastMessage.content === 'string' ? lastMessage.content : '';
            const fileSizeKB = Math.round(file.size / 1024);
            
            const updatedMessage = userText ? 
              `${userText}\n\nI've attached a file: ${fileName} (${fileSizeKB}KB, type: ${fileType})` :
              `I've attached a file: ${fileName} (${fileSizeKB}KB, type: ${fileType})`;
            
            // Replace the last message
            messages[messages.length - 1] = {
              ...lastMessage,
              content: updatedMessage
            };
          }
        }
      }
    } else {
      // Handle standard JSON request
      const jsonData = await request.json();
      messages = jsonData.messages;
    }
    
    // Get Azure configuration
    const endpoint = getAzureOpenAIEndpoint();
    const headers = createAzureAuthHeaders();
    
    console.log('Azure request endpoint:', endpoint);
    console.log('Azure request with file:', hasFile);
    console.log('File type:', hasFile ? fileType : 'none');
    console.log('File name:', hasFile ? fileName : 'none');
    
    // Create the request payload for Azure OpenAI
    const payload = {
      messages,
      stream: true,
      max_tokens: 4000,
      temperature: 0.7
    };
    
    // Make request to Azure OpenAI
    const azureResponse = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    if (!azureResponse.ok) {
      const errorText = await azureResponse.text();
      console.error('Azure API error:', errorText);
      return NextResponse.json(
        { error: `Azure OpenAI API error: ${errorText}` },
        { status: azureResponse.status }
      );
    }
    
    // Forward the streaming response directly
    const responseStream = azureResponse.body;
    if (!responseStream) {
      throw new Error('No response stream from Azure API');
    }
    
    // Return the streaming response
    return new NextResponse(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('Azure API error:', error);
    return NextResponse.json(
      { error: 'Error processing Azure OpenAI request' },
      { status: 500 }
    );
  }
} 