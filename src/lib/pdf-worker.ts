import { GlobalWorkerOptions } from 'pdfjs-dist';

// Set worker path for PDF.js - this is a crucial step for PDF.js to work properly
export const configurePdfWorker = () => {
  try {
    // In development and client-side
    if (typeof window !== 'undefined') {
      // Check if worker is already set
      if (!GlobalWorkerOptions.workerSrc) {
        console.log('Setting up PDF.js worker in client environment');
        
        // Set the worker source path
        GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      }
    } else {
      // Server environment - worker is disabled in api route
      console.log('Server environment - PDF.js worker will be disabled for server processing');
    }
  } catch (error) {
    console.error('Error configuring PDF.js worker:', error);
  }
};

export default configurePdfWorker; 