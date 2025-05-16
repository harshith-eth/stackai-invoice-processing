import { useCallback } from 'react'
import { usePlaygroundStore } from '@/store'
import { PlaygroundChatMessage } from '@/types/playground'
import { useQueryState } from 'nuqs'

// Helper function to save messages to localStorage
const saveMessagesToLocalStorage = (messages: PlaygroundChatMessage[]) => {
  try {
    localStorage.setItem('mock_messages', JSON.stringify(messages));
  } catch (error) {
    console.error("Error saving messages to localStorage:", error);
  }
}

export const useAzureChat = () => {
  // Cache the state setter functions
  const setMessages = usePlaygroundStore((state) => state.setMessages)
  const setIsStreaming = usePlaygroundStore((state) => state.setIsStreaming)
  const setStreamingErrorMessage = usePlaygroundStore(
    (state) => state.setStreamingErrorMessage
  )
  const [agentId] = useQueryState('agent')

  // Define a function to add a message without using a selector function
  const addMessage = useCallback((message: PlaygroundChatMessage) => {
    setMessages((prevMessages) => {
      const newMessages = [...prevMessages, message];
      // Save messages to localStorage for session persistence
      if (agentId === 'invoice-agent') {
        saveMessagesToLocalStorage(newMessages);
      }
      return newMessages;
    });
  }, [setMessages, agentId])

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) return

      // Add user message
      const userMessage: PlaygroundChatMessage = {
        role: 'user',
        content: message,
        created_at: Math.floor(Date.now() / 1000)
      }
      addMessage(userMessage)

      // Prepare agent message placeholder
      const agentMessage: PlaygroundChatMessage = {
        role: 'agent',
        content: '', // Will be updated during streaming
        created_at: Math.floor(Date.now() / 1000)
      }
      addMessage(agentMessage)

      try {
        setIsStreaming(true)

        // Convert messages to format expected by OpenAI API
        const playgroundMessages = usePlaygroundStore.getState().messages.slice(0, -1);
        const apiMessages = playgroundMessages.map(msg => ({
          role: msg.role === 'agent' ? 'assistant' : msg.role,
          content: msg.content
        }));

        // Add current user message
        apiMessages.push({
          role: 'user',
          content: message
        });
        
        // Add invoice processing system message
        apiMessages.unshift({
          role: 'system',
          content: `You are an Invoice Processing Assistant. Help users with:
          - Invoice data extraction
          - Payment processing
          - Invoice validation
          - Expense categorization
          - Financial reporting
          
          Be friendly and helpful. Explain how users can upload invoices for processing.
          For questions not related to invoices, politely redirect the conversation to invoice topics.`
        });

        // Call Azure API
        const response = await fetch('/api/azure-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ messages: apiMessages })
        })

        if (!response.ok) {
          throw new Error(`Error: ${response.statusText}`)
        }

        // Handle streaming response
        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No reader available')
        }

        let responseText = ''
        
        // Read and process the stream
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          // Convert bytes to text
          const chunk = new TextDecoder().decode(value)
          
          // Parse the SSE format
          const lines = chunk.split('\n').filter(line => line.trim() !== '')
          
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const jsonStr = line.slice(5).trim()
              
              // Skip [DONE] marker
              if (jsonStr === '[DONE]') continue
              
              try {
                const json = JSON.parse(jsonStr)
                const content = json.choices?.[0]?.delta?.content || ''
                if (content) {
                  responseText += content
                  
                  // Update the message in state using the setter function
                  setMessages((prevMessages) => {
                    const updatedMessages = prevMessages.map((msg, idx) => 
                      idx === prevMessages.length - 1
                        ? { ...msg, content: responseText }
                        : msg
                    );
                    
                    // Save updated messages to localStorage
                    if (agentId === 'invoice-agent') {
                      saveMessagesToLocalStorage(updatedMessages);
                    }
                    
                    return updatedMessages;
                  });
                }
              } catch (e) {
                console.error('Error parsing SSE JSON:', e)
              }
            }
          }
        }
      } catch (error) {
        console.error('Error in sendMessage:', error)
        setStreamingErrorMessage(error instanceof Error ? error.message : String(error))
        
        // Update last message with error
        setMessages((prevMessages) => {
          const updatedMessages = prevMessages.map((msg, idx) => 
            idx === prevMessages.length - 1
              ? { ...msg, content: 'Error: Failed to get response from Azure OpenAI' }
              : msg
          );
          
          // Save error message to localStorage
          if (agentId === 'invoice-agent') {
            saveMessagesToLocalStorage(updatedMessages);
          }
          
          return updatedMessages;
        });
      } finally {
        setIsStreaming(false)
      }
    },
    [addMessage, setMessages, setIsStreaming, setStreamingErrorMessage, agentId]
  )

  return { sendMessage }
} 