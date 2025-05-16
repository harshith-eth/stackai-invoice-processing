import { useCallback } from 'react'

import { APIRoutes } from '@/api/routes'

import useChatActions from '@/hooks/useChatActions'
import { usePlaygroundStore } from '../store'
import { RunEvent, type RunResponse, PlaygroundChatMessage } from '@/types/playground'
import { constructEndpointUrl } from '@/lib/constructEndpointUrl'
import useAIResponseStream from './useAIResponseStream'
import { ToolCall } from '@/types/playground'
import { useQueryState } from 'nuqs'
import { getJsonMarkdown } from '@/lib/utils'

// Helper function to save messages to localStorage
const saveMessagesToLocalStorage = (messages: PlaygroundChatMessage[]) => {
  try {
    localStorage.setItem('mock_messages', JSON.stringify(messages));
  } catch (error) {
    console.error("Error saving messages to localStorage:", error);
  }
};

/**
 * useAIChatStreamHandler is responsible for making API calls and handling the stream response.
 * For now, it only streams message content and updates the messages state.
 */
const useAIChatStreamHandler = () => {
  const messages = usePlaygroundStore((state) => state.messages)
  const setMessages = usePlaygroundStore((state) => state.setMessages)
  const { addMessage, focusChatInput } = useChatActions()
  const [agentId] = useQueryState('agent')
  const [sessionId, setSessionId] = useQueryState('session')
  const selectedEndpoint = usePlaygroundStore((state) => state.selectedEndpoint)
  const setStreamingErrorMessage = usePlaygroundStore(
    (state) => state.setStreamingErrorMessage
  )
  const setIsStreaming = usePlaygroundStore((state) => state.setIsStreaming)
  const setSessionsData = usePlaygroundStore((state) => state.setSessionsData)
  const hasStorage = usePlaygroundStore((state) => state.hasStorage)
  const { streamResponse } = useAIResponseStream()

  const updateMessagesWithErrorState = useCallback(() => {
    setMessages((prevMessages) => {
      const newMessages = [...prevMessages]
      const lastMessage = newMessages[newMessages.length - 1]
      if (lastMessage && lastMessage.role === 'agent') {
        lastMessage.streamingError = true
      }
      return newMessages
    })
  }, [setMessages])

  const handleStreamResponse = useCallback(
    async (input: string | FormData) => {
      setIsStreaming(true)

      const formData = input instanceof FormData ? input : new FormData()
      if (typeof input === 'string') {
        formData.append('message', input)
      }

      setMessages((prevMessages) => {
        if (prevMessages.length >= 2) {
          const lastMessage = prevMessages[prevMessages.length - 1]
          const secondLastMessage = prevMessages[prevMessages.length - 2]
          if (
            lastMessage.role === 'agent' &&
            lastMessage.streamingError &&
            secondLastMessage.role === 'user'
          ) {
            return prevMessages.slice(0, -2)
          }
        }
        return prevMessages
      })

      // Get user message from form data
      const userMessage = formData.get('message') as string;
      const currentTime = Math.floor(Date.now() / 1000);

      // Add user message
      addMessage({
        role: 'user',
        content: userMessage,
        created_at: currentTime
      })

      // Add initial agent message
      addMessage({
        role: 'agent',
        content: '',
        tool_calls: [],
        streamingError: false,
        created_at: currentTime + 1
      })

      // For invoice-agent, use mock response instead of making API call
      if (agentId === 'invoice-agent') {
        try {
          // Simulate response delay
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Create a mock session ID if one doesn't exist
          const mockSessionId = sessionId || `mock-session-${Date.now()}`;
          setSessionId(mockSessionId);
          
          // Add a mock session entry if needed
          if (hasStorage && (!sessionId || sessionId !== mockSessionId)) {
            const sessionData = {
              session_id: mockSessionId,
              title: userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : ''),
              created_at: currentTime
            };
            
            setSessionsData((prevSessionsData) => {
              const sessionExists = prevSessionsData?.some(
                (session) => session.session_id === mockSessionId
              );
              if (sessionExists) {
                return prevSessionsData;
              }
              return [sessionData, ...(prevSessionsData ?? [])];
            });
          }
          
          // Generate an invoice-specific mock response
          let mockResponse = "";
          if (userMessage.toLowerCase().includes("invoice") || userMessage.toLowerCase().includes("process")) {
            mockResponse = `I've analyzed the invoice details. This appears to be from ${userMessage.includes("ABC") ? "ABC Corp" : "a vendor"} with the following information:

- Invoice #: INV-${Math.floor(Math.random() * 10000)}
- Date: ${new Date().toLocaleDateString()}
- Amount: $${Math.floor(Math.random() * 10000) + 100}.00
- Due date: ${new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString()}

Would you like me to extract more details or process this for payment?`;
          } else if (userMessage.toLowerCase().includes("payment") || userMessage.toLowerCase().includes("pay")) {
            mockResponse = `I've initiated the payment process for this invoice. The payment has been scheduled and will be processed within 3-5 business days. A confirmation email will be sent once the payment is complete.`;
          } else {
            mockResponse = `I'm your Invoice Processing Assistant. I can help with:
- Invoice data extraction
- Payment processing
- Invoice validation
- Expense categorization
- Financial reporting

How can I assist with your invoices today?`;
          }
          
          // Simulate streaming the response
          let streamedContent = '';
          const words = mockResponse.split(' ');
          
          for (const word of words) {
            await new Promise(resolve => setTimeout(resolve, 30));
            streamedContent += word + ' ';
            
            setMessages((prevMessages) => {
              const newMessages = [...prevMessages];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage && lastMessage.role === 'agent') {
                lastMessage.content = streamedContent;
              }
              return newMessages;
            });
          }
          
          // Save messages to localStorage
          setMessages((prevMessages) => {
            saveMessagesToLocalStorage(prevMessages);
            return prevMessages;
          });
          
        } catch (error) {
          console.error("Error with mock response:", error);
          updateMessagesWithErrorState();
          setStreamingErrorMessage("Error generating invoice processing response");
        } finally {
          focusChatInput();
          setIsStreaming(false);
        }
        
        return;
      }

      // For default-agent, use mock response instead of making API call
      if (agentId === 'default-agent') {
        try {
          // Simulate response delay
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Create a mock session ID if one doesn't exist
          const mockSessionId = sessionId || `mock-session-${Date.now()}`;
          setSessionId(mockSessionId);
          
          // Add a mock session entry if needed
          if (hasStorage && (!sessionId || sessionId !== mockSessionId)) {
            const sessionData = {
              session_id: mockSessionId,
              title: userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : ''),
              created_at: currentTime
            };
            
            setSessionsData((prevSessionsData) => {
              const sessionExists = prevSessionsData?.some(
                (session) => session.session_id === mockSessionId
              );
              if (sessionExists) {
                return prevSessionsData;
              }
              return [sessionData, ...(prevSessionsData ?? [])];
            });
          }
          
          // Generate a mock response (can be enhanced with more intelligence if needed)
          const mockResponse = `I received your message: "${userMessage}". This is a simple mock response as we're not connected to a real AI backend. Your message has been saved locally.`;
          
          // Simulate streaming the response
          let streamedContent = '';
          const words = mockResponse.split(' ');
          
          for (const word of words) {
            await new Promise(resolve => setTimeout(resolve, 50));
            streamedContent += word + ' ';
            
            setMessages((prevMessages) => {
              const newMessages = [...prevMessages];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage && lastMessage.role === 'agent') {
                lastMessage.content = streamedContent;
              }
              return newMessages;
            });
          }
          
          // Save messages to localStorage
          setMessages((prevMessages) => {
            saveMessagesToLocalStorage(prevMessages);
            return prevMessages;
          });
          
        } catch (error) {
          console.error("Error with mock response:", error);
          updateMessagesWithErrorState();
          setStreamingErrorMessage("Error generating mock response");
        } finally {
          focusChatInput();
          setIsStreaming(false);
        }
        
        return;
      }

      // For real agents, use the original API call code
      let lastContent = ''
      let newSessionId = sessionId
      try {
        const endpointUrl = constructEndpointUrl(selectedEndpoint)

        if (!agentId) return
        const playgroundRunUrl = APIRoutes.AgentRun(endpointUrl).replace(
          '{agent_id}',
          agentId
        )

        formData.append('stream', 'true')
        formData.append('session_id', sessionId ?? '')

        await streamResponse({
          apiUrl: playgroundRunUrl,
          requestBody: formData,
          onChunk: (chunk: RunResponse) => {
            if (
              chunk.event === RunEvent.RunStarted ||
              chunk.event === RunEvent.ReasoningStarted
            ) {
              newSessionId = chunk.session_id as string
              setSessionId(chunk.session_id as string)
              if (
                hasStorage &&
                (!sessionId || sessionId !== chunk.session_id) &&
                chunk.session_id
              ) {
                const sessionData = {
                  session_id: chunk.session_id as string,
                  title: formData.get('message') as string,
                  created_at: chunk.created_at
                }
                setSessionsData((prevSessionsData) => {
                  const sessionExists = prevSessionsData?.some(
                    (session) => session.session_id === chunk.session_id
                  )
                  if (sessionExists) {
                    return prevSessionsData
                  }
                  return [sessionData, ...(prevSessionsData ?? [])]
                })
              }
            } else if (chunk.event === RunEvent.RunResponse) {
              setMessages((prevMessages) => {
                const newMessages = [...prevMessages]
                const lastMessage = newMessages[newMessages.length - 1]
                if (
                  lastMessage &&
                  lastMessage.role === 'agent' &&
                  typeof chunk.content === 'string'
                ) {
                  const uniqueContent = chunk.content.replace(lastContent, '')
                  lastMessage.content += uniqueContent
                  lastContent = chunk.content

                  const toolCalls: ToolCall[] = [...(chunk.tools ?? [])]
                  if (toolCalls.length > 0) {
                    lastMessage.tool_calls = toolCalls
                  }
                  if (chunk.extra_data?.reasoning_steps) {
                    lastMessage.extra_data = {
                      ...lastMessage.extra_data,
                      reasoning_steps: chunk.extra_data.reasoning_steps
                    }
                  }

                  if (chunk.extra_data?.references) {
                    lastMessage.extra_data = {
                      ...lastMessage.extra_data,
                      references: chunk.extra_data.references
                    }
                  }

                  lastMessage.created_at =
                    chunk.created_at ?? lastMessage.created_at
                  if (chunk.images) {
                    lastMessage.images = chunk.images
                  }
                  if (chunk.videos) {
                    lastMessage.videos = chunk.videos
                  }
                  if (chunk.audio) {
                    lastMessage.audio = chunk.audio
                  }
                } else if (
                  lastMessage &&
                  lastMessage.role === 'agent' &&
                  typeof chunk?.content !== 'string' &&
                  chunk.content !== null
                ) {
                  const jsonBlock = getJsonMarkdown(chunk?.content)

                  lastMessage.content += jsonBlock
                  lastContent = jsonBlock
                } else if (
                  chunk.response_audio?.transcript &&
                  typeof chunk.response_audio?.transcript === 'string'
                ) {
                  const transcript = chunk.response_audio.transcript
                  lastMessage.response_audio = {
                    ...lastMessage.response_audio,
                    transcript:
                      lastMessage.response_audio?.transcript + transcript
                  }
                }
                return newMessages
              })
            } else if (chunk.event === RunEvent.RunError) {
              updateMessagesWithErrorState()
              const errorContent = chunk.content as string
              setStreamingErrorMessage(errorContent)
              if (hasStorage && newSessionId) {
                setSessionsData(
                  (prevSessionsData) =>
                    prevSessionsData?.filter(
                      (session) => session.session_id !== newSessionId
                    ) ?? null
                )
              }
            } else if (chunk.event === RunEvent.RunCompleted) {
              setMessages((prevMessages) => {
                const newMessages = prevMessages.map((message, index) => {
                  if (
                    index === prevMessages.length - 1 &&
                    message.role === 'agent'
                  ) {
                    let updatedContent: string
                    if (typeof chunk.content === 'string') {
                      updatedContent = chunk.content
                    } else {
                      try {
                        updatedContent = JSON.stringify(chunk.content)
                      } catch {
                        updatedContent = 'Error parsing response'
                      }
                    }
                    return {
                      ...message,
                      content: updatedContent,
                      tool_calls:
                        chunk.tools && chunk.tools.length > 0
                          ? [...chunk.tools]
                          : message.tool_calls,
                      images: chunk.images ?? message.images,
                      videos: chunk.videos ?? message.videos,
                      response_audio: chunk.response_audio,
                      created_at: chunk.created_at ?? message.created_at,
                      extra_data: {
                        reasoning_steps:
                          chunk.extra_data?.reasoning_steps ??
                          message.extra_data?.reasoning_steps,
                        references:
                          chunk.extra_data?.references ??
                          message.extra_data?.references
                      }
                    }
                  }
                  return message
                })
                
                // Save messages to localStorage when exchange completes
                if (agentId === 'default-agent') {
                  saveMessagesToLocalStorage(newMessages);
                }
                
                return newMessages
              })
            }
          },
          onError: (error) => {
            updateMessagesWithErrorState()
            setStreamingErrorMessage(error.message)
            if (hasStorage && newSessionId) {
              setSessionsData(
                (prevSessionsData) =>
                  prevSessionsData?.filter(
                    (session) => session.session_id !== newSessionId
                  ) ?? null
              )
            }
          },
          onComplete: () => {}
        })
      } catch (error) {
        updateMessagesWithErrorState()
        setStreamingErrorMessage(
          error instanceof Error ? error.message : String(error)
        )
        if (hasStorage && newSessionId) {
          setSessionsData(
            (prevSessionsData) =>
              prevSessionsData?.filter(
                (session) => session.session_id !== newSessionId
              ) ?? null
          )
        }
      } finally {
        focusChatInput()
        setIsStreaming(false)
      }
    },
    [
      setMessages,
      addMessage,
      updateMessagesWithErrorState,
      selectedEndpoint,
      streamResponse,
      agentId,
      setStreamingErrorMessage,
      setIsStreaming,
      focusChatInput,
      setSessionsData,
      sessionId,
      setSessionId,
      hasStorage
    ]
  )

  return { handleStreamResponse }
}

export default useAIChatStreamHandler
