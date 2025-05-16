import { useCallback } from 'react'
import { toast } from 'sonner'

import { usePlaygroundStore } from '../store'

import { ComboboxAgent, type PlaygroundChatMessage } from '@/types/playground'
// We don't need these imports anymore as we're not using external APIs
// import {
//   getPlaygroundAgentsAPI,
//   getPlaygroundStatusAPI
// } from '@/api/playground'
import { useQueryState } from 'nuqs'
import { isAzureConfigured } from '@/lib/utils'

const useChatActions = () => {
  const { chatInputRef } = usePlaygroundStore()
  const selectedEndpoint = usePlaygroundStore((state) => state.selectedEndpoint)
  const [, setSessionId] = useQueryState('session')
  const setMessages = usePlaygroundStore((state) => state.setMessages)
  const setIsEndpointActive = usePlaygroundStore(
    (state) => state.setIsEndpointActive
  )
  const setIsEndpointLoading = usePlaygroundStore(
    (state) => state.setIsEndpointLoading
  )
  const setAgents = usePlaygroundStore((state) => state.setAgents)
  const setSelectedModel = usePlaygroundStore((state) => state.setSelectedModel)
  const [agentId, setAgentId] = useQueryState('agent')

  // We don't need this anymore but keeping as a stub for now
  // const getStatus = useCallback(async () => {
  //   return 200
  // }, [])

  const getAgents = useCallback(async () => {
    // We're not fetching agents from an external service, just return empty array
    return []
  }, [])

  const clearChat = useCallback(() => {
    setMessages([])
    setSessionId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const focusChatInput = useCallback(() => {
    setTimeout(() => {
      requestAnimationFrame(() => chatInputRef?.current?.focus())
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addMessage = useCallback(
    (message: PlaygroundChatMessage) => {
      setMessages((prevMessages) => [...prevMessages, message])
    },
    [setMessages]
  )

  const initializePlayground = useCallback(async () => {
    setIsEndpointLoading(true)
    try {
      // Always set endpoint as active
      setIsEndpointActive(true)
      
      // Create only the invoice processing agent
      const agents: ComboboxAgent[] = [{
        value: 'invoice-agent',
        label: 'Invoice Processing Agent',
        model: {
          provider: 'azure'
        },
        storage: true
      }];
      
      // Set invoice agent as default if none selected
      if (!agentId) {
        setAgentId('invoice-agent')
        setSelectedModel('azure')
      }
      
      setAgents(agents)
      return agents
    } catch (error) {
      console.error("Error initializing playground:", error)
      return [];
    } finally {
      setIsEndpointLoading(false)
    }
  }, [
    setIsEndpointActive,
    setIsEndpointLoading,
    setAgents,
    setAgentId,
    setSelectedModel,
    agentId
  ])

  return {
    clearChat,
    addMessage,
    getAgents,
    focusChatInput,
    initializePlayground
  }
}

export default useChatActions
