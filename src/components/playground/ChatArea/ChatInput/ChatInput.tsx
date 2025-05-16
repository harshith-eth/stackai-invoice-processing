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
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    if (file) {
      setAttachment(file)
      toast.success(`Attached: ${file.name}`)
    }
  }
  
  const handleRemoveAttachment = () => {
    setAttachment(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }
  
  const handleAttachClick = () => {
    fileInputRef.current?.click()
  }
  
  const handleSubmit = async () => {
    if (!inputMessage.trim() && !attachment) return

    const currentMessage = inputMessage
    setInputMessage('')
    
    try {
      // Handle Azure model separately
      if (selectedModel === 'azure') {
        if (attachment) {
          toast.warning('File attachments are not supported with Azure OpenAI')
        }
        await sendMessage(currentMessage)
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

  // Disable attachments for Azure
  const isAzureModel = selectedModel === 'azure'

  return (
    <div className="relative mx-auto mb-1 flex w-full max-w-2xl flex-col items-end justify-center gap-y-2 font-geist">
      {attachment && (
        <div className="w-full rounded-md border border-accent bg-primaryAccent p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Icon type="sheet" color="primary" />
              <span className="truncate">{attachment.name}</span>
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
      
      <div className="flex w-full items-end gap-x-2">
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
        />
        
        <Button
          onClick={handleAttachClick}
          size="icon"
          variant="ghost"
          className="rounded-xl border border-accent bg-primaryAccent p-2 text-primary"
          disabled={isStreaming || isAzureModel}
          title={isAzureModel ? "Attachments not supported with Azure" : "Attach file"}
        >
          <Icon type="plus-icon" color={isAzureModel ? "muted" : "primary"} />
        </Button>
        
        <TextArea
          placeholder={'Ask anything'}
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
