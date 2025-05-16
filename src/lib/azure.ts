import { constructEndpointUrl } from './constructEndpointUrl'

export const getAzureConfig = () => {
  const apiKey = process.env.AZURE_OPENAI_API_KEY || ''
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT || ''
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview'
  const resourceName = process.env.AZURE_OPENAI_RESOURCE_NAME || ''

  return {
    apiKey,
    endpoint: constructEndpointUrl(endpoint),
    apiVersion,
    resourceName
  }
}

export const createAzureAuthHeaders = () => {
  const { apiKey } = getAzureConfig()
  
  return {
    'Content-Type': 'application/json',
    'api-key': apiKey
  }
}

export const getAzureOpenAIEndpoint = () => {
  const { endpoint, apiVersion } = getAzureConfig()
  return `${endpoint}?api-version=${apiVersion}`
} 