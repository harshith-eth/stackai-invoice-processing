import { NextResponse } from 'next/server'
import { createAzureAuthHeaders, getAzureOpenAIEndpoint } from '@/lib/azure'

export async function POST(request: Request) {
  try {
    const { messages } = await request.json()
    
    // Get Azure configuration
    const endpoint = getAzureOpenAIEndpoint()
    const headers = createAzureAuthHeaders()
    
    console.log('Azure request endpoint:', endpoint);
    console.log('Azure request messages:', JSON.stringify(messages.slice(0, 1)));
    
    // Create the request payload for Azure OpenAI
    const payload = {
      messages,
      stream: true,
      max_tokens: 4000,
      temperature: 0.7
    }
    
    // Make request to Azure OpenAI
    const azureResponse = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    
    if (!azureResponse.ok) {
      const errorText = await azureResponse.text()
      console.error('Azure API error:', errorText)
      return NextResponse.json(
        { error: `Azure OpenAI API error: ${errorText}` },
        { status: azureResponse.status }
      )
    }
    
    // Forward the streaming response directly
    const responseStream = azureResponse.body
    if (!responseStream) {
      throw new Error('No response stream from Azure API')
    }
    
    // Return the streaming response
    return new NextResponse(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error) {
    console.error('Azure API error:', error)
    return NextResponse.json(
      { error: 'Error processing Azure OpenAI request' },
      { status: 500 }
    )
  }
} 