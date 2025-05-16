import { NextResponse } from 'next/server'
import { createAzureAuthHeaders, getAzureOpenAIEndpoint } from '@/lib/azure'
import { createWorker } from 'tesseract.js'
import extractTextFromPDF from '@/lib/custom-pdf'

// Define types for message content structures
interface Message {
  role: string;
  content: string;
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
              console.log('==================== OCR PROCESSING START ====================');
              console.log(`Processing image file: ${fileName} (${file.size} bytes, type: ${fileType})`);
              
              // Create a binary blob from the buffer for Tesseract
              const blob = new Blob([new Uint8Array(fileBuffer)], { type: fileType });
              console.log('Image blob created for OCR processing');
              
              // Create a worker for OCR processing (simple version without custom logger to avoid type errors)
              console.log('Initializing Tesseract OCR worker...');
              const worker = await createWorker();
              
              console.log('Starting OCR text recognition...');
              const result = await worker.recognize(blob);
              
              // Get the extracted text
              const extractedText = result.data.text;
              
              // Log results for debugging
              console.log('OCR completed successfully');
              if (result.data.confidence) {
                console.log(`OCR confidence: ${result.data.confidence.toFixed(2)}%`);
              }
              
              // Log a sample of extracted text for debugging
              const textPreview = extractedText.substring(0, 100) + (extractedText.length > 100 ? '...' : '');
              console.log(`Extracted text preview: "${textPreview}"`);
              console.log(`Total characters extracted: ${extractedText.length}`);
              
              await worker.terminate();
              console.log('OCR worker terminated');
              
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
                console.log('Invoice content detected, adding extraction prompts');
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
              
              console.log('==================== OCR PROCESSING COMPLETE ====================');
            } catch (error) {
              console.error('==================== OCR PROCESSING FAILED ====================');
              console.error(`OCR Error: ${error instanceof Error ? error.message : String(error)}`);
              if (error instanceof Error && error.stack) {
                console.error(`OCR Error stack: ${error.stack}`);
              }
              
              // Even if OCR fails, we should still inform the user
              const textContent = typeof lastMessage.content === 'string' ? lastMessage.content : '';
              let updatedMessage = textContent ? 
                `${textContent}\n\nI tried to extract text from your image "${fileName}" but OCR failed. The system encountered an error during processing.` :
                `I tried to extract text from your image "${fileName}" but OCR failed. The system encountered an error during processing.`;
                
              updatedMessage += `\n\nFor better results with invoice images:
1. Ensure the image is clear and well-lit
2. Make sure text is readable and not blurry
3. Try uploading a higher resolution image
4. Consider converting the document to a text format`;
              
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
              console.log('==================== PDF PROCESSING START ====================');
              console.log(`Processing PDF file: ${fileName} (${file.size} bytes)`);
              
              // Extract text from the PDF using the updated function
              let extractedText = '';
              try {
                console.log('Calling PDF extraction function...');
                extractedText = await extractTextFromPDF(fileBuffer);
                console.log('PDF text extraction completed successfully');
                
                // Log text sample for debugging
                const textPreview = extractedText.substring(0, 100) + (extractedText.length > 100 ? '...' : '');
                console.log(`Extracted text preview: "${textPreview}"`);
                console.log(`Total characters extracted: ${extractedText.length}`);
              } catch (pdfExtractError) {
                console.error('PDF extraction internal error:', pdfExtractError);
                extractedText = 'Error: PDF text extraction failed. The PDF might be encrypted or in an unsupported format.';
              }
              
              // Format the extracted text
              console.log('Formatting extracted text with context...');
              const userText = typeof lastMessage.content === 'string' ? lastMessage.content : '';
              let updatedMessage = '';
              
              if (userText) {
                updatedMessage = `${userText}\n\n--- EXTRACTED TEXT FROM PDF ${fileName.toUpperCase()} ---\n${extractedText}`;
              } else {
                updatedMessage = `Extracted text from PDF ${fileName}:\n${extractedText}`;
              }
              
              // If this appears to be an invoice, add a note for the AI
              if (detectInvoiceContent(extractedText, fileName)) {
                console.log('Invoice content detected, adding extraction prompts');
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
              
              console.log('==================== PDF PROCESSING COMPLETE ====================');
            } catch (pdfError) {
              console.error('==================== PDF PROCESSING FAILED ====================');
              console.error(`PDF Error: ${pdfError instanceof Error ? pdfError.message : String(pdfError)}`);
              if (pdfError instanceof Error && pdfError.stack) {
                console.error(`PDF Error stack: ${pdfError.stack}`);
              }
              
              // If PDF extraction fails completely, inform the user
              const userText = typeof lastMessage.content === 'string' ? lastMessage.content : '';
              const fileSizeKB = Math.round(file.size / 1024);
              
              let updatedMessage = userText ? 
                `${userText}\n\n` : 
                '';
                
              updatedMessage += `It seems the system encountered an error while extracting data from the uploaded PDF invoice. This could be due to the file being encrypted, scanned, or in a format that's not compatible with automated processing. Here's what you can do to help me assist you better:

Options to Proceed:

1. Manual Entry: Provide the invoice details manually, such as:
   • Invoice number
   • Invoice date
   • Total amount
   • Vendor/Company
   • Line items (individual charges)
   • Tax information

2. Re-upload in a Different Format: Convert the invoice to a different format, such as:
   • Export the invoice to a plain text file or Word document.
   • Save the scanned invoice as a higher-quality PDF, ensuring text is selectable.
   • If it's password-protected, remove the password (if authorized to do so) and re-upload.

3. Upload a Clear Image: If scanning is required, upload a clear image of the invoice. Ensure the text is legible, as OCR tools can process such images better.

How to Upload:
• Locate the upload button in the system.
• Choose the revised document or file format.
• Submit it for processing, and I'll help you extract the required details.

Let me know how you'd like to proceed!`;
              
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