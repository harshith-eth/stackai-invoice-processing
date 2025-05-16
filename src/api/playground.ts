import { toast } from 'sonner'

import { APIRoutes } from './routes'

import { Agent, ComboboxAgent, SessionEntry } from '@/types/playground'

export const getPlaygroundAgentsAPI = async (
  endpoint: string
): Promise<ComboboxAgent[]> => {
  // Return empty array - we're not fetching agents from an external service
  return []
}

export const getPlaygroundStatusAPI = async (base: string): Promise<number> => {
  // Always return 200 for success, we're not using an external playground status endpoint
  return 200
}

export const getAllPlaygroundSessionsAPI = async (
  base: string,
  agentId: string
): Promise<SessionEntry[]> => {
  // For mock agents, return empty array (sessions will be handled by useSessionLoader)
  if (agentId === 'invoice-agent' || agentId === 'default-agent' || agentId === 'azure-gpt-4o' || agentId.startsWith('invoice-')) {
    return [];
  }
  
  try {
    const response = await fetch(
      APIRoutes.GetPlaygroundSessions(base, agentId),
      {
        method: 'GET'
      }
    )
    if (!response.ok) {
      if (response.status === 404) {
        // Return empty array when storage is not enabled
        return []
      }
      throw new Error(`Failed to fetch sessions: ${response.statusText}`)
    }
    return response.json()
  } catch {
    return []
  }
}

export const getPlaygroundSessionAPI = async (
  base: string,
  agentId: string,
  sessionId: string
) => {
  // For mock agents, return an empty response structure
  if (agentId === 'invoice-agent' || agentId === 'default-agent' || agentId === 'azure-gpt-4o' || agentId.startsWith('invoice-')) {
    return {
      session_id: sessionId,
      agent_id: agentId,
      user_id: null,
      memory: {
        runs: [],
        chats: []
      },
      agent_data: {}
    };
  }
  
  // For real agents, make the API call
  const response = await fetch(
    APIRoutes.GetPlaygroundSession(base, agentId, sessionId),
    {
      method: 'GET'
    }
  )
  return response.json()
}

export const deletePlaygroundSessionAPI = async (
  base: string,
  agentId: string,
  sessionId: string
) => {
  const response = await fetch(
    APIRoutes.DeletePlaygroundSession(base, agentId, sessionId),
    {
      method: 'DELETE'
    }
  )
  return response
}
