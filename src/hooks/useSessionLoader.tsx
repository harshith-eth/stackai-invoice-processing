import { useCallback, useEffect } from 'react'
import {
  getPlaygroundSessionAPI,
  getAllPlaygroundSessionsAPI
} from '@/api/playground'
import { usePlaygroundStore } from '../store'
import { toast } from 'sonner'
import {
  PlaygroundChatMessage,
  ToolCall,
  ReasoningMessage,
  ChatEntry,
  SessionEntry
} from '@/types/playground'
import { getJsonMarkdown } from '@/lib/utils'
import { useQueryState } from 'nuqs'

interface SessionResponse {
  session_id: string
  agent_id: string
  user_id: string | null
  runs?: ChatEntry[]
  memory: {
    runs?: ChatEntry[]
    chats?: ChatEntry[]
  }
  agent_data: Record<string, unknown>
}

// Helper to create mock sessions from localStorage
const getMockSessions = (agentId: string): SessionEntry[] => {
  try {
    // Check if we have messages in the store
    const messagesJson = localStorage.getItem('mock_messages');
    if (!messagesJson) return [];
    
    const messages: PlaygroundChatMessage[] = JSON.parse(messagesJson);
    if (!messages.length) return [];
    
    // Group messages by timestamp (simulating sessions)
    const sessionGroups: { [key: string]: PlaygroundChatMessage[] } = {};
    
    messages.forEach(msg => {
      // Generate a session ID based on the day
      const timestamp = msg.created_at || Math.floor(Date.now() / 1000);
      const date = new Date(timestamp * 1000);
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      
      if (!sessionGroups[dateKey]) {
        sessionGroups[dateKey] = [];
      }
      
      sessionGroups[dateKey].push(msg);
    });
    
    // Convert to SessionEntry format
    return Object.entries(sessionGroups).map(([dateKey, msgs], index) => {
      // Get the latest message for the summary
      const latestMsg = msgs.reduce((latest, msg) => {
        const msgTime = msg.created_at || 0;
        const latestTime = latest.created_at || 0;
        return msgTime > latestTime ? msg : latest;
      }, msgs[0]);
      
      return {
        session_id: `mock-session-${index}`,
        title: `Chat from ${new Date(latestMsg.created_at * 1000).toLocaleDateString()}`,
        created_at: latestMsg.created_at || Math.floor(Date.now() / 1000)
      };
    });
  } catch (error) {
    console.error("Error loading mock sessions:", error);
    return [];
  }
}

// Save messages to localStorage to maintain simple history
const saveMockMessages = (messages: PlaygroundChatMessage[]) => {
  try {
    localStorage.setItem('mock_messages', JSON.stringify(messages));
  } catch (error) {
    console.error("Error saving mock messages:", error);
  }
}

// Load saved messages from localStorage
const loadSavedMessages = (): PlaygroundChatMessage[] => {
  try {
    const messagesJson = localStorage.getItem('mock_messages');
    if (messagesJson) {
      return JSON.parse(messagesJson);
    }
  } catch (error) {
    console.error("Error loading saved messages:", error);
  }
  return [];
}

const useSessionLoader = () => {
  const setMessages = usePlaygroundStore((state) => state.setMessages)
  const messages = usePlaygroundStore((state) => state.messages)
  const selectedEndpoint = usePlaygroundStore((state) => state.selectedEndpoint)
  const setIsSessionsLoading = usePlaygroundStore(
    (state) => state.setIsSessionsLoading
  )
  const setSessionsData = usePlaygroundStore((state) => state.setSessionsData)
  const [agentId] = useQueryState('agent')
  
  // Load saved messages when the component mounts or when agentId changes
  useEffect(() => {
    if (agentId === 'invoice-agent' || agentId === 'azure-gpt-4o') {
      const savedMessages = loadSavedMessages();
      if (savedMessages.length > 0) {
        setMessages(savedMessages);
      }
    }
  }, [agentId, setMessages]);

  const getSessions = useCallback(
    async (agentId: string) => {
      if (!agentId || !selectedEndpoint) return
      try {
        setIsSessionsLoading(true)
        
        // For mock agents, use local storage mock sessions
        if (agentId === 'default-agent' || agentId === 'invoice-agent' || agentId === 'azure-gpt-4o') {
          const mockSessions = getMockSessions(agentId);
          setSessionsData(mockSessions);
          return;
        }
        
        // For real agents, use the API
        const sessions = await getAllPlaygroundSessionsAPI(
          selectedEndpoint,
          agentId
        )
        setSessionsData(sessions)
      } catch (error) {
        console.error("Error loading sessions:", error);
        // On error, still try to use mock sessions
        if (agentId === 'default-agent' || agentId === 'invoice-agent' || agentId === 'azure-gpt-4o') {
          const mockSessions = getMockSessions(agentId);
          setSessionsData(mockSessions);
        } else {
          toast.error('Error loading sessions')
        }
      } finally {
        setIsSessionsLoading(false)
      }
    },
    [selectedEndpoint, setSessionsData, setIsSessionsLoading]
  )

  const getSession = useCallback(
    async (sessionId: string, agentId: string) => {
      if (!sessionId || !agentId || !selectedEndpoint) {
        return null
      }

      try {
        // For mock agents, load messages from localStorage
        if (agentId === 'default-agent' || agentId === 'invoice-agent' || agentId === 'azure-gpt-4o') {
          // Load saved messages
          const savedMessages = loadSavedMessages();
          if (savedMessages.length > 0) {
            setMessages(savedMessages);
            return savedMessages;
          }
          // If no saved messages, save current messages
          saveMockMessages(messages);
          return messages;
        }
        
        // For real agents, use the API
        const response = (await getPlaygroundSessionAPI(
          selectedEndpoint,
          agentId,
          sessionId
        )) as SessionResponse

        if (response && response.memory) {
          const sessionHistory = response.runs
            ? response.runs
            : response.memory.runs

          if (sessionHistory && Array.isArray(sessionHistory)) {
            const messagesForPlayground = sessionHistory.flatMap((run) => {
              const filteredMessages: PlaygroundChatMessage[] = []

              if (run.message) {
                filteredMessages.push({
                  role: 'user',
                  content: run.message.content ?? '',
                  created_at: run.message.created_at
                })
              }

              if (run.response) {
                const toolCalls = [
                  ...(run.response.tools ?? []),
                  ...(run.response.extra_data?.reasoning_messages ?? []).reduce(
                    (acc: ToolCall[], msg: ReasoningMessage) => {
                      if (msg.role === 'tool') {
                        acc.push({
                          role: msg.role,
                          content: msg.content,
                          tool_call_id: msg.tool_call_id ?? '',
                          tool_name: msg.tool_name ?? '',
                          tool_args: msg.tool_args ?? {},
                          tool_call_error: msg.tool_call_error ?? false,
                          metrics: msg.metrics ?? { time: 0 },
                          created_at:
                            msg.created_at ?? Math.floor(Date.now() / 1000)
                        })
                      }
                      return acc
                    },
                    []
                  )
                ]

                filteredMessages.push({
                  role: 'agent',
                  content: (run.response.content as string) ?? '',
                  tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                  extra_data: run.response.extra_data,
                  images: run.response.images,
                  videos: run.response.videos,
                  audio: run.response.audio,
                  response_audio: run.response.response_audio,
                  created_at: run.response.created_at
                })
              }
              return filteredMessages
            })

            const processedMessages = messagesForPlayground.map(
              (message: PlaygroundChatMessage) => {
                if (Array.isArray(message.content)) {
                  const textContent = message.content
                    .filter((item: { type: string }) => item.type === 'text')
                    .map((item) => item.text)
                    .join(' ')

                  return {
                    ...message,
                    content: textContent
                  }
                }
                if (typeof message.content !== 'string') {
                  return {
                    ...message,
                    content: getJsonMarkdown(message.content)
                  }
                }
                return message
              }
            )

            setMessages(processedMessages)
            return processedMessages
          }
        }
      } catch (error) {
        console.error("Error loading session:", error);
        return null
      }
    },
    [selectedEndpoint, setMessages, messages]
  )

  return { getSession, getSessions }
}

export default useSessionLoader
