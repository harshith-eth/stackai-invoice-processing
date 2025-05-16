import { useCallback } from 'react'
import { toast } from 'sonner'

import { usePlaygroundStore } from '../store'

import { ComboboxAgent, type PlaygroundChatMessage } from '@/types/playground'
import {
  getPlaygroundAgentsAPI,
  getPlaygroundStatusAPI
} from '@/api/playground'
import { useQueryState } from 'nuqs'

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

  const getStatus = useCallback(async () => {
    try {
      const status = await getPlaygroundStatusAPI(selectedEndpoint)
      return status
    } catch {
      return 503
    }
  }, [selectedEndpoint])

  const getAgents = useCallback(async () => {
    try {
      const agents = await getPlaygroundAgentsAPI(selectedEndpoint)
      return agents
    } catch {
      toast.error('Error fetching agents')
      return []
    }
  }, [selectedEndpoint])

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
      const status = await getStatus()
      let agents: ComboboxAgent[] = []
      
      // Always set endpoint as active regardless of status
      setIsEndpointActive(true)
      
      if (status === 200) {
        agents = await getAgents()
      }
      
      // If no agents found or fetch failed, create mock agents
      if (agents.length === 0) {
        const invoiceAgent: ComboboxAgent = {
          value: 'invoice-agent',
          label: 'Invoice Processing Agent',
          model: {
            provider: 'Document AI'
          },
          storage: true // Enable storage for the agent
        }
        agents = [invoiceAgent]
      }
      
      // Set default agent if none selected
      if (agents.length > 0 && !agentId) {
        const firstAgent = agents[0]
        setAgentId(firstAgent.value)
        setSelectedModel(firstAgent.model.provider || '')
      }
      
      setAgents(agents)
      return agents
    } catch (error) {
      console.error("Error initializing playground:", error)
      
      // Add invoice agent even on error
      const invoiceAgent: ComboboxAgent = {
        value: 'invoice-agent',
        label: 'Invoice Processing Agent',
        model: {
          provider: 'Document AI'
        },
        storage: true // Enable storage for the agent
      }
      
      setAgents([invoiceAgent])
      setAgentId('invoice-agent')
      setSelectedModel('Document AI')
      
      setIsEndpointLoading(false)
      return [invoiceAgent]
    } finally {
      setIsEndpointLoading(false)
    }
  }, [
    getStatus,
    getAgents,
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
