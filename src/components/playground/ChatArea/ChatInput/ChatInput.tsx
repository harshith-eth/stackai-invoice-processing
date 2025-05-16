'use client'
import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { TextArea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { usePlaygroundStore } from '@/store'
import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import { useAzureChat } from '@/hooks/useAzureChat'
import { useQueryState } from 'nuqs'
import Icon from '@/components/ui/icon'

const ChatInput = () => {
  const { chatInputRef } = usePlaygroundStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const { handleStreamResponse } = useAIChatStreamHandler()
  const { sendMessage } = useAzureChat()
  const [selectedAgent] = useQueryState('agent')
  const [inputMessage, setInputMessage] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const isStreaming = usePlaygroundStore((state) => state.isStreaming)
  const selectedModel = usePlaygroundStore((state) => state.selectedModel)
  
  // Check if the current agent is the invoice agent
  const isInvoiceAgent = selectedAgent === 'invoice-agent'
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    if (file) {
      setAttachment(file)
      
      // For invoice agent, add specific format tips
      if (isInvoiceAgent) {
        // Check file type for possible issues with PDFs
        if (file.type === 'application/pdf') {
          toast.success(`Invoice attached: ${file.name}`, {
            description: "PDF detected. The AI will attempt to extract text. If it's a scanned document, OCR will be applied automatically."
          })
          
          // Add a hint about extraction to the input field if empty
          if (!inputMessage) {
            setInputMessage("Please process this invoice and extract all relevant information.");
          }
        } else if (file.type.startsWith('image/')) {
          toast.success(`Invoice image attached: ${file.name}`, {
            description: "Image detected. OCR will be used to extract text. For best results, ensure the image is clear and well-lit."
          })
          
          // Add a hint about extraction to the input field if empty
          if (!inputMessage) {
            setInputMessage("Please extract the invoice details from this image.");
          }
        } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
          toast.success(`Text file attached: ${file.name}`, {
            description: "Text file detected. The content will be processed directly."
          })
        } else if (file.type.includes('word') || file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
          toast.success(`Document attached: ${file.name}`, {
            description: "Document detected. Text will be extracted for processing."
          })
        } else {
          toast.success(`File attached: ${file.name}`)
        }
      } else {
        toast.success(`Attached: ${file.name}`)
      }
    }
  }
  
  const handleRemoveAttachment = () => {
    setAttachment(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }
  
  const handleAttachClick = () => {
    if (isInvoiceAgent) {
      toast.info("Upload an invoice", {
        description: "Supported formats: PDF, images (JPG, PNG), text files, and Word documents. PDFs with selectable text work best.",
        duration: 4000
      });
    }
    fileInputRef.current?.click()
  }
  
  const handleSubmit = async () => {
    if (!inputMessage.trim() && !attachment) return

    const currentMessage = inputMessage
    setInputMessage('')
    
    try {
      // Handle Azure model separately
      if (selectedModel === 'azure') {
        await sendMessage(currentMessage, attachment)
      } else {
        // Use FormData to properly send both message and file
        if (attachment) {
          const formData = new FormData()
          formData.append('message', currentMessage)
          formData.append('file', attachment, attachment.name)
          
          // Get attachment metadata for display in the message
          const attachmentData = {
            name: attachment.name,
            type: attachment.type,
            size: attachment.size
          }
          
          // Add to the FormData for processing on server side
          formData.append('attachment_metadata', JSON.stringify(attachmentData))
          
          await handleStreamResponse(formData)
        } else {
          // Just send the text message if no attachment
          await handleStreamResponse(currentMessage)
        }
      }
      
      // Clear attachment after sending
      setAttachment(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      toast.error(
        `Error in handleSubmit: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  return (
    <div className="relative mx-auto mb-1 flex w-full max-w-2xl flex-col items-end justify-center gap-y-2 font-geist">
      {attachment && (
        <div className="w-full rounded-md border border-accent bg-primaryAccent p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Icon type="sheet" color="primary" />
              <span className="truncate">{attachment.name}</span>
              {isInvoiceAgent && attachment.type === 'application/pdf' && (
                <span className="text-xs text-muted-foreground">(OCR enabled)</span>
              )}
              {isInvoiceAgent && attachment.type.startsWith('image/') && (
                <span className="text-xs text-muted-foreground">(OCR enabled)</span>
              )}
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleRemoveAttachment}
              className="h-6 w-6 rounded-full p-0"
            >
              <Icon type="x" color="primary" />
            </Button>
          </div>
        </div>
      )}
      
      {isInvoiceAgent && !attachment && (
        <div className="mb-1 w-full rounded-md border border-accent bg-primaryAccent/30 p-2 text-xs text-muted-foreground">
          <p className="font-medium text-primary">Invoice Processing Assistant</p>
          <p>Upload an invoice file using the clip icon. For best results:</p>
          <ul className="mt-1 list-disc pl-5">
            <li>PDFs with selectable text work best</li>
            <li>Clear, well-lit images will improve OCR accuracy</li>
            <li>Scanned documents will be processed with OCR automatically</li>
          </ul>
        </div>
      )}
      
      <div className="flex w-full items-end gap-x-2">
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept={isInvoiceAgent ? 
            ".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" : 
            ".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.mp3,.mp4,.wav"}
        />
        
        <Button
          onClick={handleAttachClick}
          size="icon"
          variant="ghost"
          className="rounded-xl border border-accent bg-primaryAccent p-2 text-primary"
          disabled={isStreaming}
          title={isInvoiceAgent ? "Attach invoice file" : "Attach file"}
        >
          <Icon type="plus-icon" color="primary" />
        </Button>
        
        <TextArea
          placeholder={isInvoiceAgent ? 'Ask about invoice processing or upload a file' : 'Ask anything'}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.nativeEvent.isComposing &&
              !e.shiftKey &&
              !isStreaming
            ) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          className="w-full border border-accent bg-primaryAccent px-4 text-sm text-primary focus:border-accent"
          disabled={false}
          ref={chatInputRef}
        />
        <Button
          onClick={handleSubmit}
          disabled={(!inputMessage.trim() && !attachment) || isStreaming}
          size="icon"
          className="rounded-xl bg-primary p-5 text-primaryAccent"
        >
          <Icon type="send" color="primaryAccent" />
        </Button>
      </div>
    </div>
  )
}

export default ChatInput
